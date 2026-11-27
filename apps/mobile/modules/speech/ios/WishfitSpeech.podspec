Pod::Spec.new do |s|
  # Not 'Speech': the pod name becomes the Swift module name and would shadow Apple's Speech framework.
  s.name           = 'WishfitSpeech'
  s.version        = '1.0.0'
  s.summary        = 'On-device dictation'
  s.description    = 'Thin bridge to Apple\'s Speech framework (SFSpeechRecognizer), ported from justap.'
  s.author         = 'bemany'
  s.homepage       = 'https://wishfit.vercel.app'
  s.platforms      = { :ios => '15.1' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.frameworks = 'Speech', 'AVFoundation'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES'
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
