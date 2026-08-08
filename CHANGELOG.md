# [1.2.0](https://github.com/wolasss/random-scale-trainer/compare/v1.1.0...v1.2.0) (2026-08-08)


### Bug Fixes

* **a11y:** give the fretboard map an accessible reading ([#30](https://github.com/wolasss/random-scale-trainer/issues/30)) ([e165ab1](https://github.com/wolasss/random-scale-trainer/commit/e165ab12f9ca77679a86e5174d760af1afe5fd5a))
* **a11y:** keep focus inside the practice sheet and give it back on close ([#25](https://github.com/wolasss/random-scale-trainer/issues/25)) ([06e2801](https://github.com/wolasss/random-scale-trainer/commit/06e2801ef54965b2bc80b9adc1868b1039dd2cc8))
* **a11y:** let the arrow keys move the segmented controls ([#33](https://github.com/wolasss/random-scale-trainer/issues/33)) ([b39704d](https://github.com/wolasss/random-scale-trainer/commit/b39704d6f5b42896fcb4e8715140a1840c2cfee8))
* **a11y:** stop global shortcuts from hijacking keys on focused controls ([#19](https://github.com/wolasss/random-scale-trainer/issues/19)) ([3a143e2](https://github.com/wolasss/random-scale-trainer/commit/3a143e281b88d4398c4b1e54b8c65a95997ad9ae))
* **audio:** let a failed note-audio preload retry on the next start ([#24](https://github.com/wolasss/random-scale-trainer/issues/24)) ([8e294aa](https://github.com/wolasss/random-scale-trainer/commit/8e294aa60f0151097672f61eff39c0adc67b48e4))
* **history:** drop stored practice days whose key is not a real calendar date ([#32](https://github.com/wolasss/random-scale-trainer/issues/32)) ([0773016](https://github.com/wolasss/random-scale-trainer/commit/0773016c5da3dadd1bae99e028a473870737b57b))
* **history:** the practice log's Clear resets the timer, not the log ([#50](https://github.com/wolasss/random-scale-trainer/issues/50)) ([fb8e7fa](https://github.com/wolasss/random-scale-trainer/commit/fb8e7fafc78135f9b8deeeeb1d71b55e8e4f5f14))
* **playback:** let the transport cancel a start while the audio is still loading ([#21](https://github.com/wolasss/random-scale-trainer/issues/21)) ([662d364](https://github.com/wolasss/random-scale-trainer/commit/662d36497c8b0288ab45089009065cfa7ba9cf6e))
* **preview:** allow tailnet hosts so branch previews load over the tailnet ([#20](https://github.com/wolasss/random-scale-trainer/issues/20)) ([0dbdbce](https://github.com/wolasss/random-scale-trainer/commit/0dbdbce0ea500a4cba0a39cbb3b37e46da6cd781)), closes [#18](https://github.com/wolasss/random-scale-trainer/issues/18)
* **routines:** reject stored routines that reuse an id or repeat a pitch class ([#34](https://github.com/wolasss/random-scale-trainer/issues/34)) ([511930c](https://github.com/wolasss/random-scale-trainer/commit/511930cf6b425789b2ee8c51a71d86f6d9ec768e))
* **settings:** reject a blank or gappy stored note pool ([#28](https://github.com/wolasss/random-scale-trainer/issues/28)) ([4e14a8b](https://github.com/wolasss/random-scale-trainer/commit/4e14a8b070965c445ef62d5dc239dd3d98d6801f))
* **settings:** reject unrecognised stored values for the boolean settings ([#31](https://github.com/wolasss/random-scale-trainer/issues/31)) ([eda3908](https://github.com/wolasss/random-scale-trainer/commit/eda3908a13964307efddd8fb814d078075fd53f5))
* survive a blocked or throwing localStorage ([#18](https://github.com/wolasss/random-scale-trainer/issues/18)) ([afd00d1](https://github.com/wolasss/random-scale-trainer/commit/afd00d128a46064069f36d929f3b98b1e78f5cb9))


### Features

* **brand:** rebrand to callnote.app ([#46](https://github.com/wolasss/random-scale-trainer/issues/46)) ([5a1d6a4](https://github.com/wolasss/random-scale-trainer/commit/5a1d6a4262a8d82f47039b2f46b9978191de3adf))
* **tempo:** add 12-beats span and a count-in toggle ([#27](https://github.com/wolasss/random-scale-trainer/issues/27)) ([f3a92cf](https://github.com/wolasss/random-scale-trainer/commit/f3a92cf6cd49cfd6ff4a137ae22e374115c27894))
* **theme:** visual skin picker — glass / instrument / editorial / warm ([#43](https://github.com/wolasss/random-scale-trainer/issues/43)) ([5f64017](https://github.com/wolasss/random-scale-trainer/commit/5f640170893eed2e8cc30decaf63f87a3d1387ed))

# [1.1.0](https://github.com/wolasss/random-scale-trainer/compare/v1.0.5...v1.1.0) (2026-08-07)


### Features

* note pool, presets, fretboard tool, options ([#12](https://github.com/wolasss/random-scale-trainer/issues/12)) ([c197863](https://github.com/wolasss/random-scale-trainer/commit/c197863ac28325d66f01ec0a7731f1603b314b51))

## [1.0.5](https://github.com/wolasss/random-scale-trainer/compare/v1.0.4...v1.0.5) (2026-06-16)


### Bug Fixes

* fix playback on iphones ([a2488cd](https://github.com/wolasss/random-scale-trainer/commit/a2488cdc2821458a16a96245e7ef42ab3f937386))
* use precomputed audio files ([a2a0217](https://github.com/wolasss/random-scale-trainer/commit/a2a0217a1cc323e3392220a4c6a77a11ebffabe2))

## [1.0.4](https://github.com/wolasss/random-scale-trainer/compare/v1.0.3...v1.0.4) (2026-04-09)


### Bug Fixes

* reset button stops the playback ([7b43710](https://github.com/wolasss/random-scale-trainer/commit/7b43710ba8b4204f3d44731617fc53af0e0466b3))

## [1.0.3](https://github.com/wolasss/random-scale-trainer/compare/v1.0.2...v1.0.3) (2026-04-09)


### Bug Fixes

* fix github link ([4d661dc](https://github.com/wolasss/random-scale-trainer/commit/4d661dc8bfba5bbdff6f89d1df380b90a1f4e24b))

## [1.0.2](https://github.com/wolasss/random-scale-trainer/compare/v1.0.1...v1.0.2) (2026-04-09)


### Bug Fixes

* show app version in the footer ([3a54f46](https://github.com/wolasss/random-scale-trainer/commit/3a54f4655b93b0615484328cab88f254a8741a4c))

## [1.0.1](https://github.com/wolasss/random-scale-trainer/compare/v1.0.0...v1.0.1) (2026-04-09)


### Bug Fixes

* use gh token ([fdb79ce](https://github.com/wolasss/random-scale-trainer/commit/fdb79cefffd3b10be2a2716eef66ca0a7e36ea8e))

# 1.0.0 (2026-04-09)


### Bug Fixes

* dockerfile ([9dba332](https://github.com/wolasss/random-scale-trainer/commit/9dba332be95590cf5bb6437b4b75984b2d0d8392))
* footer ([67edcda](https://github.com/wolasss/random-scale-trainer/commit/67edcda346ebec3028a46af04da6f815b7e234ba))
* improve stying ([a8e2c57](https://github.com/wolasss/random-scale-trainer/commit/a8e2c57c8dc43f371e38194a4cb7d0c011487dac))
* improve workflow ([6dd7624](https://github.com/wolasss/random-scale-trainer/commit/6dd762475279cb04096c3f0646e2290a20a1d02e))
* improvements ([86ec11c](https://github.com/wolasss/random-scale-trainer/commit/86ec11ceda96981529126c53a47306fb019035e1))
* init ([f38a8c6](https://github.com/wolasss/random-scale-trainer/commit/f38a8c68a13d7269635b5b4c98067f9dd430558c))
* minor fixes ([b9736d6](https://github.com/wolasss/random-scale-trainer/commit/b9736d62043dda9066b0bab95772bd0331f730b8))
* play and pause ([2f1e5f3](https://github.com/wolasss/random-scale-trainer/commit/2f1e5f37c727868abbe2b87f7e9cbb421e26474e))
* proper pronounciation ([906f33c](https://github.com/wolasss/random-scale-trainer/commit/906f33c986109ceba3bdea2f4cbb02ae29ceb9af))
* speed ramp mode ([a7b17b9](https://github.com/wolasss/random-scale-trainer/commit/a7b17b97b14931961df463105c6cab4dbf9292fb))
* ux improvements ([9812a64](https://github.com/wolasss/random-scale-trainer/commit/9812a6405ed33c6eb1b906302a35816770592692))
* UX improvements ([6053621](https://github.com/wolasss/random-scale-trainer/commit/6053621e390063738abe483574d803a565161afb))
