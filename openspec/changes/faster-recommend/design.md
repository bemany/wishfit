# Design

1. **Cache:** `price_search_cache(query_key text primary key, result jsonb, created_at timestamptz)`, angelegt unter dem bestehenden Advisory-Lock. Schlüssel: kleingeschrieben, Satzzeichen entfernt, Leerzeichen zusammengefasst. Lesen vor jedem Actor-Lauf, Schreiben nur bei Erfolg mit mindestens einem Treffer. Fehler beim Cache-Zugriff sind nie fatal. Ein Cache-Treffer kostet nichts und wird im Trace mit `cache: true` und Dauer markiert.
2. **Weniger Läufe:** Im Apify-Pfad gehen höchstens 2 Ideen in die Suche (die ersten nach Zusammenlegen). Der Rest der Antwort bleibt gleich.
3. **Actor-Aufruf:** zuerst messen (Start bis Ende, Poll-Intervall). Wenn `run-sync-get-dataset-items` innerhalb des Lauf-Timeouts zuverlässig ist, ihn nutzen; sonst Poll-Intervall auf 1–2 s. Kostenverbuchung bleibt wie bisher.
4. **Trace:** `timings_ms {understand, search, decide, total}`.
