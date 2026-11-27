// Ported from the author's own app justap (modules/speech). Comments below are from the original and partly German.
import AVFoundation
import ExpoModulesCore
import Speech

/**
 Diktat auf dem Geraet (BMT-214, AP7 aus BMT-204), ueber Apples Speech framework.

 **Der Ton verlaesst das Telefon nie.** `requiresOnDeviceRecognition = true` haelt die Erkennung auf
 dem Geraet; nur der erkannte Text geht weiter, und auch der erst, wenn der Nutzer ihn abschickt.
 Gespeichert wird nichts, weder als Datei noch ueber das Ende der Sitzung hinaus.

 Damit kehrt dieses Modul BMT-105 um, wo eigene Aufnahmen bewusst verworfen wurden (die
 Diktierfunktion der Tastatur trug den Fall schon). Der Grund fuer die Umkehr ist der Assistent aus
 BMT-212: dort ist Sprechen der schnellere Weg als Tippen, und das Tastatur-Mikrofon steht nur in
 einem Textfeld zur Verfuegung, nicht als eigener Knopf im Ablauf.

 **Warum `requiresOnDeviceRecognition` und nicht Apples Server:** ohne die Zeile schickt Apple den Ton
 an seine eigenen Dienste, und das waere genau die Datenart, die wir vermeiden. Ist die Erkennung
 auf dem Geraet fuer eine Sprache nicht verfuegbar, meldet das Modul das, statt still auszuweichen.
 */

private enum Status: String {
  case granted, denied, undetermined
}

final class SpeechUnavailable: Exception {
  override var reason: String { "Speech recognition is not ready on this device." }
}

/// Getrennt von `SpeechUnavailable`, weil der Grund ein anderer ist und der Nutzer etwas tun kann:
/// die Sprache in den iOS-Einstellungen unter Tastatur und Diktat einmal herunterladen.
final class SpeechNotOnDevice: Exception {
  override var reason: String {
    "On-device recognition for this language is missing. Download it once in iOS Settings under General, Keyboard, Dictation."
  }
}

final class MicUnavailable: Exception {
  override var reason: String { "The microphone is not available right now, another app may be using it." }
}

final class SpeechDenied: Exception {
  override var reason: String { "Dictation needs the microphone and speech recognition." }
}

public class SpeechModule: Module {
  private var recognizer: SFSpeechRecognizer?
  private let engine = AVAudioEngine()

  /**
   **Eine Aufnahme besteht aus Runden, und eine Pause beendet nur die Runde, nicht die Aufnahme** (#311).
   Bis zum 11.10.2026 gab es genau eine Runde: Stille (Apple-Code 1110), ein `isFinal` und die Grenze
   von rund einer Minute endeten wie ein Fehler, der Knopf sprang zurück, und wer laut nachdenkt,
   macht Pausen. Jetzt startet in diesen Fällen eine neue `SFSpeechAudioBufferRecognitionRequest`,
   Engine und Tap laufen weiter. Neu zu starten in JS hiesse, Engine und Audio-Sitzung jedes Mal hoch-
   und herunterzufahren, mit hörbarem Klick und verlorenen Silben.

   Jede Runde schreibt in ihr eigenes Fach in `rounds`, nicht in einen gemeinsamen Zwischenstand: das
   letzte Ergebnis einer abgelösten Runde kommt oft erst, wenn die nächste schon läuft, und so kann es
   nichts überschreiben. Der Text der Aufnahme ist die Verkettung aller Fächer.
   */
  private var rounds: [String] = []
  private var round = -1
  private var roundStarted = Date()
  private var quickFailures = 0
  private var active = false
  private var task: SFSpeechRecognitionTask?
  /// Kennung der Aufnahme. Ein Rückruf einer früheren Aufnahme trägt eine alte Kennung und wird
  /// verworfen, auch wenn seine Runden-Id zufällig zur neuen passt.
  private var session = 0

  /// **Engine und Audio-Sitzung laufen auf einer eigenen Queue, nie auf dem Hauptthread.**
  /// `removeTap`, `engine.stop` und `setActive(false)` blockieren, und der erste Zugriff auf
  /// `engine.inputNode` stürzte auf dem Hauptthread ab (`AURemoteIO::Initialize`, RPC-Timeout an den
  /// Audio-Dienst, 11.10.2026 im Simulator). Seriell, damit Start und Abbau sich nicht überholen.
  private let audioQueue = DispatchQueue(label: "de.bemany.wishloop.speech.audio")

  /// Der Tap läuft auf dem Audio-Thread und schreibt in die jeweils aktuelle Runde; der Wechsel
  /// passiert auf dem Hauptthread. Deshalb ein Schloss um genau diese eine Referenz.
  private let lock = NSLock()
  private var _request: SFSpeechAudioBufferRecognitionRequest?
  private var request: SFSpeechAudioBufferRecognitionRequest? {
    get { lock.lock(); defer { lock.unlock() }; return _request }
    set { lock.lock(); _request = newValue; lock.unlock() }
  }

  /// Der Puffer geht unter dem Schloss in die Anfrage, damit ein Rundenwechsel nicht zwischen Lesen
  /// und Anhängen fällt und ein Puffer in einer schon beendeten Anfrage landet.
  private func append(_ buffer: AVAudioPCMBuffer) {
    lock.lock()
    _request?.append(buffer)
    lock.unlock()
  }

  /// Apple begrenzt eine Runde auf rund eine Minute. Wir lösen kurz davor selbst ab, statt auf den
  /// Abbruch zu warten, dessen Code sich zwischen Server und Gerät unterscheidet.
  private static let roundLimit: TimeInterval = 50

  /// Codes, die keine Störung sind, sondern das Ende einer Runde: 1110 heisst Stille, 203 meldet der
  /// Server bei einer Runde ohne Sprache, 216 und 301 sind Abbrüche (durch `stop` oder eine Ablösung).
  private static let roundEnd: Set<Int> = [1110, 203, 216, 301]
  private static let silence = 1110

  private var text: String {
    rounds.map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }.joined(separator: " ")
  }

  /// Beide Rechte zusammen: iOS fuehrt Mikrofon und Spracherkennung getrennt, fuer den Nutzer ist es
  /// eine Frage. Erteilt heisst deshalb: beide erteilt.
  private func status() -> Status {
    let speech = SFSpeechRecognizer.authorizationStatus()
    let audio = AVAudioSession.sharedInstance().recordPermission
    if speech == .authorized && audio == .granted { return .granted }
    if speech == .denied || speech == .restricted || audio == .denied { return .denied }
    return .undetermined
  }

  /// **Apples Meldungen sind englisch und sagen dem Nutzer nichts.** "Failed to initialize
  /// recognizer" heisst in aller Regel: fuer diese Sprache liegt kein Modell auf dem Geraet, und das
  /// laesst sich beheben, man muss es nur wissen (im Simulator gibt es keines, das ist dort der
  /// Normalzustand, gemessen am 22.09.2026). Der Rest bekommt einen ruhigen Satz statt eines Codes.
  private static func satz(for error: NSError) -> String {
    switch error.code {
    case 102, 1101, 1107:
      return "On-device recognition for this language is missing. Download it once in iOS Settings under General, Keyboard, Dictation; after that it works offline too."
    default:
      return "Dictation did not work. Please try again."
    }
  }

  /// Alles zurück auf Anfang, in zwei Hälften. Gebraucht aus drei Richtungen: `stop`, ein echter
  /// Fehler der Erkennung und das Abräumen des Moduls.
  ///
  /// Der Zustand gehört dem Hauptthread (dort kommen die Rückrufe an), der Ton der eigenen Queue.
  private func endState() {
    active = false
    session += 1
    task?.cancel()
    task = nil
    request = nil
  }

  private func stopAudio() {
    engine.inputNode.removeTap(onBus: 0)
    if engine.isRunning { engine.stop() }
    try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
  }

  /// Eine neue Runde auf derselben Engine. Die alte Anfrage bekommt `endAudio`, damit ihr letztes
  /// Ergebnis noch ankommt; sie ist danach nicht mehr die aktuelle und kann nichts mehr auslösen.
  private func startRound() {
    guard active, let recognizer else { return }
    let old = request

    let next = SFSpeechAudioBufferRecognitionRequest()
    // Zwischenstaende, damit der Nutzer sieht, dass es laeuft; ohne sie steht das Feld still, bis
    // er aufhoert zu sprechen, und das sieht nach einem Fehler aus.
    next.shouldReportPartialResults = true
    // Der Kern der Entscheidung aus BMT-214: die Erkennung bleibt auf dem Geraet.
    //
    // **Im Simulator geht das nicht**, dort bricht die Erkennung mit "Failed to initialize
    // recognizer" ab, auch wenn `supportsOnDeviceRecognition` true meldet (22.09.2026 gemessen,
    // iOS 26.5). Weil im Simulator keine echten Daten liegen, laeuft sie dort ueber Apples Dienst,
    // damit der Weg ueberhaupt vorfuehrbar ist. Auf einem Geraet gilt die Zusage unveraendert:
    // `targetEnvironment(simulator)` ist zur Bauzeit entschieden, in keiner ausgelieferten .ipa
    // steht dieser Zweig.
    #if targetEnvironment(simulator)
      next.requiresOnDeviceRecognition = false
    #else
      next.requiresOnDeviceRecognition = true
    #endif

    round += 1
    let id = round
    let sid = session
    rounds.append("")
    roundStarted = Date()
    request = next
    old?.endAudio()

    task = recognizer.recognitionTask(with: next) { [weak self] result, error in
      DispatchQueue.main.async { self?.handle(session: sid, round: id, result: result, error: error) }
    }

    DispatchQueue.main.asyncAfter(deadline: .now() + Self.roundLimit) { [weak self] in
      guard let self, self.active, self.session == sid, self.round == id else { return }
      self.startRound()
    }
  }

  private func handle(session sid: Int, round id: Int, result: SFSpeechRecognitionResult?, error: Error?) {
    guard active, sid == session, id < rounds.count else { return }
    if let result {
      rounds[id] = result.bestTranscription.formattedString
      quickFailures = 0
      sendEvent("onResult", ["text": text, "final": false])
    }
    // Nur die aktuelle Runde entscheidet, wie es weitergeht; eine abgelöste liefert nur noch Text.
    guard id == round else { return }
    if result?.isFinal == true {
      startRound()
      return
    }
    guard let error else { return }
    let ns = error as NSError
    if Self.roundEnd.contains(ns.code) {
      // **Schutz gegen eine Schleife ohne Ende.** Stirbt jede Runde sofort und ohne Text, ist das
      // keine Pause, sondern eine Störung, und die gehört dem Nutzer gesagt, statt dass der rote
      // Knopf ewig steht. **Stille (1110) zählt dabei nie**, sie ist genau die Pause, die die
      // Aufnahme überstehen soll; sonst stünde mitten im Nachdenken eine Fehlermeldung da.
      if ns.code != Self.silence && rounds[id].isEmpty && Date().timeIntervalSince(roundStarted) < 1 {
        quickFailures += 1
      } else {
        quickFailures = 0
      }
      if quickFailures < 3 {
        startRound()
        return
      }
    }
    sendEvent("onError", ["message": Self.satz(for: ns), "code": ns.code])
    endState()
    audioQueue.async { self.stopAudio() }
  }

  public func definition() -> ModuleDefinition {
    Name("Speech")

    // **Zwei Ereignisse, und das zweite ist das wichtigere.** Bis zum 22.09.2026 verschluckte der
    // Rückruf der Erkennung jeden Fehler (`result, _`): ging etwas schief, blieb der rote Knopf
    // stehen und nichts geschah, ohne einen einzigen Hinweis. Genau so hat es sich angefühlt.
    // `onResult` trägt seit #311 den Text der ganzen Aufnahme über alle Runden, nicht den der Runde.
    Events("onResult", "onError")

    AsyncFunction("getPermissions") { () -> String in
      self.status().rawValue
    }

    AsyncFunction("requestPermissions") { (promise: Promise) in
      SFSpeechRecognizer.requestAuthorization { _ in
        AVAudioSession.sharedInstance().requestRecordPermission { _ in
          promise.resolve(self.status().rawValue)
        }
      }
    }

    AsyncFunction("start") { (locale: String) in
      if self.status() != .granted { throw SpeechDenied() }

      let recognizer = SFSpeechRecognizer(locale: Locale(identifier: locale))
      guard let recognizer, recognizer.isAvailable else { throw SpeechUnavailable() }
      // **Ohne Erkennung auf dem Gerät wird nicht gestartet.** Still auf Apples Server auszuweichen
      // wäre genau die Datenart, die dieses Modul vermeidet, und der Zwecktext in app.json sagt dem
      // Nutzer das Gegenteil. Lieber ein Satz, der erklärt, was fehlt.
      #if !targetEnvironment(simulator)
        guard recognizer.supportsOnDeviceRecognition else { throw SpeechNotOnDevice() }
      #endif

      // Eine noch laufende Aufnahme zuerst abräumen, bevor die Audio-Sitzung neu aufgeht. Der
      // Zustand wird auf dem Hauptthread gelesen und geschrieben, nie hier.
      DispatchQueue.main.sync {
        self.endState()
        self.recognizer = recognizer
        self.rounds = []
        self.round = -1
        self.quickFailures = 0
      }

      try self.audioQueue.sync {
        self.stopAudio()
        let audio = AVAudioSession.sharedInstance()
        try audio.setCategory(.record, mode: .measurement, options: .duckOthers)
        try audio.setActive(true, options: .notifyOthersOnDeactivation)

        let node = self.engine.inputNode
        // **Ein Eingang ohne Format ist kein Mikrofon** (#311). Ist es belegt oder fehlt es, meldet
        // AURemoteIO -10851 nur ins Systemlog und liefert ein Format mit 0 Hz; `installTap` damit
        // wirft eine Objective-C-Ausnahme, die Swift nicht fangen kann. Lieber ein Satz.
        let format = node.outputFormat(forBus: 0)
        guard format.sampleRate > 0, format.channelCount > 0 else {
          self.stopAudio()
          throw MicUnavailable()
        }
        node.removeTap(onBus: 0)
        // Der Tap liest die Anfrage bei jedem Puffer neu: so landet der Ton nach einem Rundenwechsel
        // ohne Lücke in der neuen Runde.
        node.installTap(onBus: 0, bufferSize: 1024, format: format) { [weak self] buffer, _ in
          self?.append(buffer)
        }
        self.engine.prepare()
        do {
          try self.engine.start()
        } catch {
          self.stopAudio()
          throw error
        }
      }
      DispatchQueue.main.sync {
        self.active = true
        self.startRound()
      }
    }

    AsyncFunction("stop") { () -> String in
      let text = DispatchQueue.main.sync { () -> String in
        let text = self.text
        self.request?.endAudio()
        self.endState()
        return text
      }
      self.audioQueue.sync { self.stopAudio() }
      return text
    }

    OnDestroy {
      DispatchQueue.main.async { self.endState() }
      self.audioQueue.async { self.stopAudio() }
    }
  }
}
