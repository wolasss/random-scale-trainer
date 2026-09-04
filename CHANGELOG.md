## [1.29.1](https://github.com/wolasss/random-scale-trainer/compare/v1.29.0...v1.29.1) (2026-09-04)


### Bug Fixes

* **app:** show a recoverable error screen instead of a blank page when a render throws ([#232](https://github.com/wolasss/random-scale-trainer/issues/232)) ([038bcf7](https://github.com/wolasss/random-scale-trainer/commit/038bcf75f3d43c7d367c964bf011009653a88511))
* **history:** build the export backup from the live practice log, not from storage ([#228](https://github.com/wolasss/random-scale-trainer/issues/228)) ([4d41038](https://github.com/wolasss/random-scale-trainer/commit/4d4103857045909ec2cf95c39c710ce106bd4fc2))
* **mic:** recover a second dropped microphone stream instead of reporting it as denied ([#230](https://github.com/wolasss/random-scale-trainer/issues/230)) ([ee53198](https://github.com/wolasss/random-scale-trainer/commit/ee53198a265fe6f8edd07ead2ec25bfb3552f2bc))

# [1.29.0](https://github.com/wolasss/random-scale-trainer/compare/v1.28.7...v1.29.0) (2026-09-02)


### Bug Fixes

* **csp:** drop 'unsafe-inline' from script-src and allow the shell's inline scripts by hash ([#202](https://github.com/wolasss/random-scale-trainer/issues/202)) ([e7f367a](https://github.com/wolasss/random-scale-trainer/commit/e7f367aaccf8b97066c5142d67ab9d757f5d6464))
* **scoreboard:** rate-limit board reads so a flood cannot starve a live board ([#213](https://github.com/wolasss/random-scale-trainer/issues/213)) ([a907a81](https://github.com/wolasss/random-scale-trainer/commit/a907a810a6ac134529dfca5d0a142501581ca9bd))


### Features

* **stage:** adjust the tempo from the stand without opening the setup sheet ([#214](https://github.com/wolasss/random-scale-trainer/issues/214)) ([44e9b46](https://github.com/wolasss/random-scale-trainer/commit/44e9b46dc6d847ba21e63262b49316e6f3357a90))


### Performance Improvements

* **bundle:** lazy-load the shared-challenge components out of the main chunk ([#212](https://github.com/wolasss/random-scale-trainer/issues/212)) ([a7b3e87](https://github.com/wolasss/random-scale-trainer/commit/a7b3e8700dedf8af10917be1ee2c6ba2899f05d3))

## [1.28.7](https://github.com/wolasss/random-scale-trainer/compare/v1.28.6...v1.28.7) (2026-09-01)


### Bug Fixes

* **challenge:** time-bound scoreboard requests so a stalled network can't wedge the join ([#210](https://github.com/wolasss/random-scale-trainer/issues/210)) ([dc02614](https://github.com/wolasss/random-scale-trainer/commit/dc02614492a6550c906040aa1efd29b61fd9a61c))
* **history:** clear a stale import error when the sheet closes and announce it via role="alert" ([#204](https://github.com/wolasss/random-scale-trainer/issues/204)) ([9bb575a](https://github.com/wolasss/random-scale-trainer/commit/9bb575a11715cb020ab365ae39497704fde7d4ea))
* **history:** make exporting a practice-log backup survive a browser that refuses the download ([#206](https://github.com/wolasss/random-scale-trainer/issues/206)) ([dddd0e0](https://github.com/wolasss/random-scale-trainer/commit/dddd0e0a5d15d71d1e54435c58d76aa875db3b33))
* **shortcuts:** stop Space and R reaching the transport from behind an open sheet ([#209](https://github.com/wolasss/random-scale-trainer/issues/209)) ([e3e472c](https://github.com/wolasss/random-scale-trainer/commit/e3e472c622862afe176da7c4237539bf634b4b71))
* strip control characters from bug reports and time-bound outbound calls ([#203](https://github.com/wolasss/random-scale-trainer/issues/203)) ([7ee4b05](https://github.com/wolasss/random-scale-trainer/commit/7ee4b05af307b649270a53c8fd3799f4f980bf0f))

## [1.28.6](https://github.com/wolasss/random-scale-trainer/compare/v1.28.5...v1.28.6) (2026-08-31)


### Bug Fixes

* **wakelock:** re-take a screen lock the system drops while practice is still running ([#201](https://github.com/wolasss/random-scale-trainer/issues/201)) ([71f46b8](https://github.com/wolasss/random-scale-trainer/commit/71f46b8c336ca4a6fc9e74d3b3d935ee83fc18cd))

## [1.28.5](https://github.com/wolasss/random-scale-trainer/compare/v1.28.4...v1.28.5) (2026-08-28)


### Bug Fixes

* **pitch:** stop the detector reading notes above ~750 Hz an octave low ([#198](https://github.com/wolasss/random-scale-trainer/issues/198)) ([b0d3289](https://github.com/wolasss/random-scale-trainer/commit/b0d3289b35f1790d802f309832290bb37f602657))

## [1.28.4](https://github.com/wolasss/random-scale-trainer/compare/v1.28.3...v1.28.4) (2026-08-28)


### Bug Fixes

* **a11y:** give the routine strip's skip/unload and hint dismiss buttons a fingertip target on touch screens ([#174](https://github.com/wolasss/random-scale-trainer/issues/174)) ([9feb7f6](https://github.com/wolasss/random-scale-trainer/commit/9feb7f624e9d82ff945a42171faa5362b6cd5cec))
* **mic:** recover when the microphone stream dies mid-practice ([#193](https://github.com/wolasss/random-scale-trainer/issues/193)) ([461cd41](https://github.com/wolasss/random-scale-trainer/commit/461cd41b9d331bee15cd8939d384e1674954a748))
* **routines:** keep a finished workout restartable after deleting an earlier block ([#199](https://github.com/wolasss/random-scale-trainer/issues/199)) ([d585f6a](https://github.com/wolasss/random-scale-trainer/commit/d585f6afc4ed07afe95c4d0adf99ecb6a6f6a5fd))

## [1.28.3](https://github.com/wolasss/random-scale-trainer/compare/v1.28.2...v1.28.3) (2026-08-28)


### Bug Fixes

* **a11y:** let the keyboard scroll the fretboard neck when it overflows ([#200](https://github.com/wolasss/random-scale-trainer/issues/200)) ([8663560](https://github.com/wolasss/random-scale-trainer/commit/86635608fd8f56fef7685294b50ca1866a2a2a9e))

## [1.28.2](https://github.com/wolasss/random-scale-trainer/compare/v1.28.1...v1.28.2) (2026-08-26)


### Bug Fixes

* **history:** surface the import error when a backup file cannot be read ([#196](https://github.com/wolasss/random-scale-trainer/issues/196)) ([4ce4e1f](https://github.com/wolasss/random-scale-trainer/commit/4ce4e1f343afca45b91361044ae314aa7167cd6e))

## [1.28.1](https://github.com/wolasss/random-scale-trainer/compare/v1.28.0...v1.28.1) (2026-08-26)


### Bug Fixes

* **mic:** gate silence against the room the capture measures, not a constant ([#195](https://github.com/wolasss/random-scale-trainer/issues/195)) ([fca54e2](https://github.com/wolasss/random-scale-trainer/commit/fca54e2292d0b49c16b4b41790e02d8b0a670728))

# [1.28.0](https://github.com/wolasss/random-scale-trainer/compare/v1.27.4...v1.28.0) (2026-08-26)


### Features

* **mic:** an on-device debug overlay, and a poll-loop resume retry ([#194](https://github.com/wolasss/random-scale-trainer/issues/194)) ([5b91137](https://github.com/wolasss/random-scale-trainer/commit/5b91137af452f96314117ca0d42932034bb804ec))

## [1.27.4](https://github.com/wolasss/random-scale-trainer/compare/v1.27.3...v1.27.4) (2026-08-26)


### Bug Fixes

* **history:** commit the practice log onto freshly read storage so a second open tab cannot erase logged minutes ([#191](https://github.com/wolasss/random-scale-trainer/issues/191)) ([db77572](https://github.com/wolasss/random-scale-trainer/commit/db775721f7fb96b09c88c130c0a74fdbc60e5253))
* **mic:** analyse on a capture-born context, and lower the silence floor ([#190](https://github.com/wolasss/random-scale-trainer/issues/190)) ([f67df32](https://github.com/wolasss/random-scale-trainer/commit/f67df329e93e69b4b7031da9fbd5de965b9e3b41))


### Performance Improvements

* **timer:** stop the 200 ms session tick from re-rendering the whole app ([#188](https://github.com/wolasss/random-scale-trainer/issues/188)) ([37c028a](https://github.com/wolasss/random-scale-trainer/commit/37c028a2e1b107cfc919b7c817fa299f561c83eb))

## [1.27.3](https://github.com/wolasss/random-scale-trainer/compare/v1.27.2...v1.27.3) (2026-08-25)


### Bug Fixes

* **mic:** capture raw audio instead of a voice-processed stream ([#189](https://github.com/wolasss/random-scale-trainer/issues/189)) ([7fac36b](https://github.com/wolasss/random-scale-trainer/commit/7fac36b127b326bf8a185495e0f5daaf053b2f41))

## [1.27.2](https://github.com/wolasss/random-scale-trainer/compare/v1.27.1...v1.27.2) (2026-08-25)


### Bug Fixes

* **mobile:** unwedge the idle start button and give the stand's mic row and stats room ([#187](https://github.com/wolasss/random-scale-trainer/issues/187)) ([b29abee](https://github.com/wolasss/random-scale-trainer/commit/b29abeecf5d05cb472fc938280369b7fe4cbe8e4))

## [1.27.1](https://github.com/wolasss/random-scale-trainer/compare/v1.27.0...v1.27.1) (2026-08-25)


### Bug Fixes

* **mic:** resume the context iOS parks when the microphone opens ([#186](https://github.com/wolasss/random-scale-trainer/issues/186)) ([28002c4](https://github.com/wolasss/random-scale-trainer/commit/28002c4c1d6c66c7d81e84b394202bfbdb2421f2))

# [1.27.0](https://github.com/wolasss/random-scale-trainer/compare/v1.26.1...v1.27.0) (2026-08-25)


### Features

* **footer:** report a bug from the app, behind a captcha ([#185](https://github.com/wolasss/random-scale-trainer/issues/185)) ([4822d7d](https://github.com/wolasss/random-scale-trainer/commit/4822d7d358827596ae2ca7b9fae5d4d45beb8839))

## [1.26.1](https://github.com/wolasss/random-scale-trainer/compare/v1.26.0...v1.26.1) (2026-08-25)


### Bug Fixes

* **hero:** keep the idle ready caption clear of the note line edge ([#183](https://github.com/wolasss/random-scale-trainer/issues/183)) ([7f8ac14](https://github.com/wolasss/random-scale-trainer/commit/7f8ac14046c657a93a3dbf03ab0083c7e05bfca8))

# [1.26.0](https://github.com/wolasss/random-scale-trainer/compare/v1.25.2...v1.26.0) (2026-08-25)


### Bug Fixes

* **sw:** precache each asset from the network instead of the browser's 7-day HTTP cache ([#180](https://github.com/wolasss/random-scale-trainer/issues/180)) ([ea02712](https://github.com/wolasss/random-scale-trainer/commit/ea027120996cddc02bba4ff5dfacf5736b558681))


### Features

* **challenge:** size the board for a large virtual class and harden scoring ([#179](https://github.com/wolasss/random-scale-trainer/issues/179)) ([a1038f3](https://github.com/wolasss/random-scale-trainer/commit/a1038f345f4eb3b147ee0b2b589ebafaff1ed662))
* **tempo:** hold the BPM steppers to sweep the tempo instead of tapping ([#182](https://github.com/wolasss/random-scale-trainer/issues/182)) ([d8e3927](https://github.com/wolasss/random-scale-trainer/commit/d8e39275147f9395e219c8be4cb7300b2a276b27))


### Performance Improvements

* **pitch:** make the NSDF energy term O(1) per lag with a prefix sum of squares ([#181](https://github.com/wolasss/random-scale-trainer/issues/181)) ([0e6a891](https://github.com/wolasss/random-scale-trainer/commit/0e6a891971a74fcc8e049e464f3d11e6ea205503))

## [1.25.2](https://github.com/wolasss/random-scale-trainer/compare/v1.25.1...v1.25.2) (2026-08-25)


### Bug Fixes

* **scoreboard:** cap what a board response may put on screen before rendering it ([#170](https://github.com/wolasss/random-scale-trainer/issues/170)) ([ade467d](https://github.com/wolasss/random-scale-trainer/commit/ade467d39401ad55e388a30e6edf82e42f05bf12))

## [1.25.1](https://github.com/wolasss/random-scale-trainer/compare/v1.25.0...v1.25.1) (2026-08-25)


### Bug Fixes

* **history:** give the practice history sheet a first-run empty state ([#177](https://github.com/wolasss/random-scale-trainer/issues/177)) ([8089fcc](https://github.com/wolasss/random-scale-trainer/commit/8089fcc12d3ff9001c1ebf06c1b6e9c97558d4f6))

# [1.25.0](https://github.com/wolasss/random-scale-trainer/compare/v1.24.0...v1.25.0) (2026-08-24)


### Features

* **mic:** split the score readout into a play row and a pause summary ([#173](https://github.com/wolasss/random-scale-trainer/issues/173)) ([69a2037](https://github.com/wolasss/random-scale-trainer/commit/69a2037a5ac196a467e1cdf80e1757c17d529f2e))

# [1.24.0](https://github.com/wolasss/random-scale-trainer/compare/v1.23.2...v1.24.0) (2026-08-24)


### Features

* **challenge:** read the shared board as a rail, and fold it on a phone ([#172](https://github.com/wolasss/random-scale-trainer/issues/172)) ([787acd7](https://github.com/wolasss/random-scale-trainer/commit/787acd7a2a9ff408b918a71d861996300450ab61))

## [1.23.2](https://github.com/wolasss/random-scale-trainer/compare/v1.23.1...v1.23.2) (2026-08-24)


### Bug Fixes

* **challenge:** reject a malformed stored ownership token instead of crashing on the board ([#169](https://github.com/wolasss/random-scale-trainer/issues/169)) ([9466550](https://github.com/wolasss/random-scale-trainer/commit/9466550eab40264324bbd94bf9eb7e6b56bf6a99))

## [1.23.1](https://github.com/wolasss/random-scale-trainer/compare/v1.23.0...v1.23.1) (2026-08-24)


### Bug Fixes

* **tempo:** keep the ramp target above the tempo when the tempo climbs past it ([#160](https://github.com/wolasss/random-scale-trainer/issues/160)) ([221227f](https://github.com/wolasss/random-scale-trainer/commit/221227f030064055d2ae2a9fd5d62640ae10e767))

# [1.23.0](https://github.com/wolasss/random-scale-trainer/compare/v1.22.2...v1.23.0) (2026-08-24)


### Features

* **routines:** edit a workout's blocks — retime, reorder and insert ([#157](https://github.com/wolasss/random-scale-trainer/issues/157)) ([0ded4b3](https://github.com/wolasss/random-scale-trainer/commit/0ded4b32d5c68a7d4dd4b30bfd38b31ba54b339b))

## [1.22.2](https://github.com/wolasss/random-scale-trainer/compare/v1.22.1...v1.22.2) (2026-08-24)


### Bug Fixes

* **routines:** name a block after the key it drills instead of calling five presets 'custom' ([#163](https://github.com/wolasss/random-scale-trainer/issues/163)) ([59a2f51](https://github.com/wolasss/random-scale-trainer/commit/59a2f51228775be8960a4080036fbfe78b6a7aa5))
* **scoreboard:** write the snapshot atomically so a torn file can't reset every nickname's ownership ([#164](https://github.com/wolasss/random-scale-trainer/issues/164)) ([24d995b](https://github.com/wolasss/random-scale-trainer/commit/24d995b301b241b6662bf853caf21e24a5d51ada))
* **scoring:** keep the strike time after a hit so the in-time bonus survives a stray detection ([#161](https://github.com/wolasss/random-scale-trainer/issues/161)) ([73481a5](https://github.com/wolasss/random-scale-trainer/commit/73481a5573023dbfdda8248ec1eb3f9f34ab659f))

## [1.22.1](https://github.com/wolasss/random-scale-trainer/compare/v1.22.0...v1.22.1) (2026-08-22)


### Bug Fixes

* **api:** refuse cross-site POSTs to the scoreboard endpoints ([#147](https://github.com/wolasss/random-scale-trainer/issues/147)) ([6e75767](https://github.com/wolasss/random-scale-trainer/commit/6e75767d483b5f46a051b60445de4131d067d250))

# [1.22.0](https://github.com/wolasss/random-scale-trainer/compare/v1.21.0...v1.22.0) (2026-08-21)


### Features

* **scoring:** price the shared board by the same difficulty as the readout ([#143](https://github.com/wolasss/random-scale-trainer/issues/143)) ([066f2fb](https://github.com/wolasss/random-scale-trainer/commit/066f2fb98d1daf545739f043d0a5863df43f36bb))

# [1.21.0](https://github.com/wolasss/random-scale-trainer/compare/v1.20.0...v1.21.0) (2026-08-21)


### Features

* **challenge:** own a nickname with a token and score sessions on the server ([#135](https://github.com/wolasss/random-scale-trainer/issues/135)) ([8aa2dd2](https://github.com/wolasss/random-scale-trainer/commit/8aa2dd2e0b37f0d9b05471201f56ca996037731e))

# [1.20.0](https://github.com/wolasss/random-scale-trainer/compare/v1.19.0...v1.20.0) (2026-08-21)


### Features

* **pool:** save the current chip selection as a named preset ([#139](https://github.com/wolasss/random-scale-trainer/issues/139)) ([98b16dc](https://github.com/wolasss/random-scale-trainer/commit/98b16dc7ff1a90b7e68238bb7ce43834da350d31))

# [1.19.0](https://github.com/wolasss/random-scale-trainer/compare/v1.18.0...v1.19.0) (2026-08-21)


### Features

* **session:** tap the goal readout to count down instead of up ([#140](https://github.com/wolasss/random-scale-trainer/issues/140)) ([7264f57](https://github.com/wolasss/random-scale-trainer/commit/7264f573caa1d81b9bc312d2895f010963288ae1))

# [1.18.0](https://github.com/wolasss/random-scale-trainer/compare/v1.17.0...v1.18.0) (2026-08-21)


### Features

* **scoring:** bonus points at 10, 20 and 30 minutes of practice ([#134](https://github.com/wolasss/random-scale-trainer/issues/134)) ([cbbdf2e](https://github.com/wolasss/random-scale-trainer/commit/cbbdf2e673cbc6b93946f2dc37463416f4f405d7))

# [1.17.0](https://github.com/wolasss/random-scale-trainer/compare/v1.16.1...v1.17.0) (2026-08-20)


### Features

* **scoring:** price each note by how hard the settings make it ([#132](https://github.com/wolasss/random-scale-trainer/issues/132)) ([1faf118](https://github.com/wolasss/random-scale-trainer/commit/1faf118adcfa793ef712448ee4f1886adf81b30e))

## [1.16.1](https://github.com/wolasss/random-scale-trainer/compare/v1.16.0...v1.16.1) (2026-08-20)


### Bug Fixes

* **scoring:** label the readings on the score line ([#130](https://github.com/wolasss/random-scale-trainer/issues/130)) ([800650a](https://github.com/wolasss/random-scale-trainer/commit/800650a312a7bd8ebe0aa56f94584738df1b1172))

# [1.16.0](https://github.com/wolasss/random-scale-trainer/compare/v1.15.0...v1.16.0) (2026-08-20)


### Features

* **challenge:** shared challenges with a top-ten scoreboard ([#128](https://github.com/wolasss/random-scale-trainer/issues/128)) ([7cd2d1e](https://github.com/wolasss/random-scale-trainer/commit/7cd2d1ecb89b7b934519e9e63af914a1147932de))

# [1.15.0](https://github.com/wolasss/random-scale-trainer/compare/v1.14.0...v1.15.0) (2026-08-20)


### Features

* **scoring:** bonus for playing the note in time with the tick ([#127](https://github.com/wolasss/random-scale-trainer/issues/127)) ([7a82344](https://github.com/wolasss/random-scale-trainer/commit/7a82344d7af5be8648a9bc809c17c59e64a2b42b))

# [1.14.0](https://github.com/wolasss/random-scale-trainer/compare/v1.13.0...v1.14.0) (2026-08-20)


### Features

* **scoring:** bonus for playing the called note in two octaves ([#124](https://github.com/wolasss/random-scale-trainer/issues/124)) ([a10f00d](https://github.com/wolasss/random-scale-trainer/commit/a10f00d7457cd6c387479e85075b4beeb3ae7c86))

# [1.13.0](https://github.com/wolasss/random-scale-trainer/compare/v1.12.3...v1.13.0) (2026-08-19)


### Features

* **scoring:** give practice a point total with a bonus for a streak ([#123](https://github.com/wolasss/random-scale-trainer/issues/123)) ([19c83c5](https://github.com/wolasss/random-scale-trainer/commit/19c83c58899b84c8a9de25c14f04e23b5bac4fff))

## [1.12.3](https://github.com/wolasss/random-scale-trainer/compare/v1.12.2...v1.12.3) (2026-08-19)


### Bug Fixes

* **pwa:** follow the chosen theme in the installed app's window chrome ([#115](https://github.com/wolasss/random-scale-trainer/issues/115)) ([a8e0938](https://github.com/wolasss/random-scale-trainer/commit/a8e09386c8510ea21570ae28de03c4ed26dd03eb))

## [1.12.2](https://github.com/wolasss/random-scale-trainer/compare/v1.12.1...v1.12.2) (2026-08-19)


### Bug Fixes

* **options:** say why the mic switch is off when the browser can't listen ([#114](https://github.com/wolasss/random-scale-trainer/issues/114)) ([072d5f0](https://github.com/wolasss/random-scale-trainer/commit/072d5f088c82f1217363923a270e6a5c089bf578))

## [1.12.1](https://github.com/wolasss/random-scale-trainer/compare/v1.12.0...v1.12.1) (2026-08-19)


### Bug Fixes

* **pwa:** treat every installed display mode as standalone ([#110](https://github.com/wolasss/random-scale-trainer/issues/110)) ([d733baa](https://github.com/wolasss/random-scale-trainer/commit/d733baac70c8bf3e4cd86be184ada6aa0a959347))

# [1.12.0](https://github.com/wolasss/random-scale-trainer/compare/v1.11.1...v1.12.0) (2026-08-19)


### Bug Fixes

* **ts:** stop tsconfig.test.json from excluding every test file it exists to check ([#111](https://github.com/wolasss/random-scale-trainer/issues/111)) ([1050f1a](https://github.com/wolasss/random-scale-trainer/commit/1050f1a85fe7306b0024ba1ad3e0dbe7ec823b0a))


### Features

* **routines:** duplicate a routine into an editable copy ([#112](https://github.com/wolasss/random-scale-trainer/issues/112)) ([df3df45](https://github.com/wolasss/random-scale-trainer/commit/df3df45abccead26cd9c89406d12e6620d6c6c58))

## [1.11.1](https://github.com/wolasss/random-scale-trainer/compare/v1.11.0...v1.11.1) (2026-08-19)


### Bug Fixes

* **wakelock:** release the lock a superseded request leaves behind ([#108](https://github.com/wolasss/random-scale-trainer/issues/108)) ([fb1460c](https://github.com/wolasss/random-scale-trainer/commit/fb1460cb0ecf9aee42b0b2ba8ce954207997cb0e))

# [1.11.0](https://github.com/wolasss/random-scale-trainer/compare/v1.10.0...v1.11.0) (2026-08-19)


### Bug Fixes

* **history:** surface a failed save instead of silently losing the practice log ([#107](https://github.com/wolasss/random-scale-trainer/issues/107)) ([b75c621](https://github.com/wolasss/random-scale-trainer/commit/b75c621d990d5c80efbf290403447f857e923254))


### Features

* **practice:** score the heard notes against the called notes ([#106](https://github.com/wolasss/random-scale-trainer/issues/106)) ([5ad5fd2](https://github.com/wolasss/random-scale-trainer/commit/5ad5fd29e1c4615db0f1a88e776f695b8a6cb96f))

# [1.10.0](https://github.com/wolasss/random-scale-trainer/compare/v1.9.1...v1.10.0) (2026-08-19)


### Features

* **routines:** let the hero routine strip skip to the next block ([#117](https://github.com/wolasss/random-scale-trainer/issues/117)) ([b1c4050](https://github.com/wolasss/random-scale-trainer/commit/b1c40508613e1808a245ead4427008c5b192ea87))

## [1.9.1](https://github.com/wolasss/random-scale-trainer/compare/v1.9.0...v1.9.1) (2026-08-19)


### Bug Fixes

* **sw:** answer an offline navigation with a readable page instead of an empty 504 ([#116](https://github.com/wolasss/random-scale-trainer/issues/116)) ([6c1a118](https://github.com/wolasss/random-scale-trainer/commit/6c1a118e239c0b71d13e058f28ef2fa2e46fbb83))

# [1.9.0](https://github.com/wolasss/random-scale-trainer/compare/v1.8.1...v1.9.0) (2026-08-17)


### Bug Fixes

* **a11y:** give the installed app a way to switch between light and dark ([#101](https://github.com/wolasss/random-scale-trainer/issues/101)) ([191f33d](https://github.com/wolasss/random-scale-trainer/commit/191f33dbfe461416cf6a1295284afa3303fd7cd3))
* **a11y:** hide the header key hints when there is no hardware keyboard ([#102](https://github.com/wolasss/random-scale-trainer/issues/102)) ([ae1c154](https://github.com/wolasss/random-scale-trainer/commit/ae1c154d3c9b13e309515b883c7ab6eeec8855ae))
* **sw:** stop the background revalidate from overwriting precached entries ([#98](https://github.com/wolasss/random-scale-trainer/issues/98)) ([230a673](https://github.com/wolasss/random-scale-trainer/commit/230a67338ad74b0dca0846cf01c72fdc33594e23))


### Features

* **history:** tap a day in the practice calendar to read it out ([#103](https://github.com/wolasss/random-scale-trainer/issues/103)) ([79c8133](https://github.com/wolasss/random-scale-trainer/commit/79c8133362b264ec3dc502882e44b49ff1a9d142))
* **mic:** hear the player with an autocorrelation pitch detector and a live heard-note readout ([#105](https://github.com/wolasss/random-scale-trainer/issues/105)) ([bc4fc4e](https://github.com/wolasss/random-scale-trainer/commit/bc4fc4e9d0f0de18b2ca83021b64e7f2e92dcc57))

## [1.8.1](https://github.com/wolasss/random-scale-trainer/compare/v1.8.0...v1.8.1) (2026-08-16)


### Bug Fixes

* **manifest:** pin the installed app's id and guard the manifest against drift ([#88](https://github.com/wolasss/random-scale-trainer/issues/88)) ([979b430](https://github.com/wolasss/random-scale-trainer/commit/979b430943e6e706deb9eac2778fd4cf5771025b))

# [1.8.0](https://github.com/wolasss/random-scale-trainer/compare/v1.7.1...v1.8.0) (2026-08-16)


### Features

* **shortcuts:** tap the tempo with the T key ([#84](https://github.com/wolasss/random-scale-trainer/issues/84)) ([f69c5f4](https://github.com/wolasss/random-scale-trainer/commit/f69c5f4edc21b22f3a625e7e3a60abf2b4c92ca1))

## [1.7.1](https://github.com/wolasss/random-scale-trainer/compare/v1.7.0...v1.7.1) (2026-08-16)


### Bug Fixes

* **fretboard:** hint that the neck scrolls on narrow screens ([#85](https://github.com/wolasss/random-scale-trainer/issues/85)) ([713ce94](https://github.com/wolasss/random-scale-trainer/commit/713ce9432187c324d7a555c7194369b92085fad2))
* **pwa:** look for a new build when the app comes back to the foreground ([#86](https://github.com/wolasss/random-scale-trainer/issues/86)) ([f7dbfcb](https://github.com/wolasss/random-scale-trainer/commit/f7dbfcbc7bd21e98b2200822138566010d52ab22))

# [1.7.0](https://github.com/wolasss/random-scale-trainer/compare/v1.6.2...v1.7.0) (2026-08-16)


### Bug Fixes

* **build:** key the offline cache on public asset contents, not just their names ([#89](https://github.com/wolasss/random-scale-trainer/issues/89)) ([55a6416](https://github.com/wolasss/random-scale-trainer/commit/55a64160f7625674cdbb89ef81495d3867519e9c))


### Features

* **pool:** group the note-pool presets by family and add the flat major keys ([#91](https://github.com/wolasss/random-scale-trainer/issues/91)) ([8d0196d](https://github.com/wolasss/random-scale-trainer/commit/8d0196d6161c98973fa562c7ea0a1753c901d85b))

## [1.6.2](https://github.com/wolasss/random-scale-trainer/compare/v1.6.1...v1.6.2) (2026-08-16)


### Bug Fixes

* **history:** reject an oversized or non-JSON file before reading a backup ([#92](https://github.com/wolasss/random-scale-trainer/issues/92)) ([ead2646](https://github.com/wolasss/random-scale-trainer/commit/ead26469d4e3a472712ac48c14ea635e8d90576b))

## [1.6.1](https://github.com/wolasss/random-scale-trainer/compare/v1.6.0...v1.6.1) (2026-08-16)


### Bug Fixes

* **a11y:** announce each switch's explanation with the switch itself ([#97](https://github.com/wolasss/random-scale-trainer/issues/97)) ([0de9d0f](https://github.com/wolasss/random-scale-trainer/commit/0de9d0f239f149649eed53e015b884fac6969ed2))

# [1.6.0](https://github.com/wolasss/random-scale-trainer/compare/v1.5.4...v1.6.0) (2026-08-15)


### Bug Fixes

* **a11y:** list the reset shortcut in the header key hints ([#83](https://github.com/wolasss/random-scale-trainer/issues/83)) ([701e481](https://github.com/wolasss/random-scale-trainer/commit/701e4814ddb7475bfa0e1a6b0b588af40a39f4fd))


### Features

* **session:** mark the moment the practice goal is reached ([#81](https://github.com/wolasss/random-scale-trainer/issues/81)) ([6750f29](https://github.com/wolasss/random-scale-trainer/commit/6750f290c1b5e2769ae3fb65c432c202141c3761))

## [1.5.4](https://github.com/wolasss/random-scale-trainer/compare/v1.5.3...v1.5.4) (2026-08-13)


### Bug Fixes

* **hero:** drop the hit-Space hint on touch-only devices ([#79](https://github.com/wolasss/random-scale-trainer/issues/79)) ([df68f3f](https://github.com/wolasss/random-scale-trainer/commit/df68f3ffba7b65a5d9bf806fd728cb625035c1c8))

## [1.5.3](https://github.com/wolasss/random-scale-trainer/compare/v1.5.2...v1.5.3) (2026-08-11)


### Bug Fixes

* **audio:** let stop silence a scheduled end-of-session chime ([#67](https://github.com/wolasss/random-scale-trainer/issues/67)) ([241b498](https://github.com/wolasss/random-scale-trainer/commit/241b49829356b795cab291b747dcdbaa85589c18))

## [1.5.2](https://github.com/wolasss/random-scale-trainer/compare/v1.5.1...v1.5.2) (2026-08-11)


### Bug Fixes

* **playback:** settle the transport when the audio context fails to create or resume ([#73](https://github.com/wolasss/random-scale-trainer/issues/73)) ([58d8fee](https://github.com/wolasss/random-scale-trainer/commit/58d8fee5fd5023380284788fc5bc5e9329435a71))

## [1.5.1](https://github.com/wolasss/random-scale-trainer/compare/v1.5.0...v1.5.1) (2026-08-10)


### Bug Fixes

* **routines:** make deleting a saved setup deliberate ([#69](https://github.com/wolasss/random-scale-trainer/issues/69)) ([3e5b3cd](https://github.com/wolasss/random-scale-trainer/commit/3e5b3cd556177b1e38deeb7169bcacd6ac6c2906))

# [1.5.0](https://github.com/wolasss/random-scale-trainer/compare/v1.4.1...v1.5.0) (2026-08-10)


### Features

* **pool:** add minor-key presets to the note pool ([#77](https://github.com/wolasss/random-scale-trainer/issues/77)) ([b15b81f](https://github.com/wolasss/random-scale-trainer/commit/b15b81fee093b21ce13a898e4d2ebfca0d74eb8d))

## [1.4.1](https://github.com/wolasss/random-scale-trainer/compare/v1.4.0...v1.4.1) (2026-08-10)


### Bug Fixes

* **routines:** say when a saved setup cannot outlive the tab ([#75](https://github.com/wolasss/random-scale-trainer/issues/75)) ([cc4490a](https://github.com/wolasss/random-scale-trainer/commit/cc4490ad70d9e62ec87a3fd7ac2b094bc2634fe0))

# [1.4.0](https://github.com/wolasss/random-scale-trainer/compare/v1.3.3...v1.4.0) (2026-08-10)


### Features

* **history:** practice history view with a monthly heatmap and backup export/import ([#76](https://github.com/wolasss/random-scale-trainer/issues/76)) ([76c5939](https://github.com/wolasss/random-scale-trainer/commit/76c59391de90b8d5867cc01632e68131a6797134))

## [1.3.3](https://github.com/wolasss/random-scale-trainer/compare/v1.3.2...v1.3.3) (2026-08-09)


### Bug Fixes

* **history:** stop crediting a frozen background stretch as practice time ([#66](https://github.com/wolasss/random-scale-trainer/issues/66)) ([ed7d571](https://github.com/wolasss/random-scale-trainer/commit/ed7d57173f701e36b056371b35f8725f8a23f3b9))

## [1.3.2](https://github.com/wolasss/random-scale-trainer/compare/v1.3.1...v1.3.2) (2026-08-09)


### Bug Fixes

* **routines:** keep the selected routine when the preset dropdown says Custom ([#63](https://github.com/wolasss/random-scale-trainer/issues/63)) ([349dadb](https://github.com/wolasss/random-scale-trainer/commit/349dadb13e5b42a05551a76d9c9b9b863c3a9bc8))

## [1.3.1](https://github.com/wolasss/random-scale-trainer/compare/v1.3.0...v1.3.1) (2026-08-09)


### Bug Fixes

* **a11y:** give the joined segmented controls a full-size touch target ([#56](https://github.com/wolasss/random-scale-trainer/issues/56)) ([beda550](https://github.com/wolasss/random-scale-trainer/commit/beda550c7614df8de4a9d88be51efec7c4c85919))

# [1.3.0](https://github.com/wolasss/random-scale-trainer/compare/v1.2.2...v1.3.0) (2026-08-08)


### Features

* **ux:** calm the first run and tier routines into setups and workouts ([#55](https://github.com/wolasss/random-scale-trainer/issues/55)) ([87a3352](https://github.com/wolasss/random-scale-trainer/commit/87a33524cfa7257fad86552032e667654bbca6ca))

## [1.2.2](https://github.com/wolasss/random-scale-trainer/compare/v1.2.1...v1.2.2) (2026-08-08)


### Bug Fixes

* **tempo:** say why the speed ramp switch is disabled ([#54](https://github.com/wolasss/random-scale-trainer/issues/54)) ([35d3793](https://github.com/wolasss/random-scale-trainer/commit/35d3793b4451c8048c1ef0d7d5cc4fdfe6ae3df1))

## [1.2.1](https://github.com/wolasss/random-scale-trainer/compare/v1.2.0...v1.2.1) (2026-08-08)


### Bug Fixes

* **mobile:** keep the setup sheet's controls inside the screen ([#52](https://github.com/wolasss/random-scale-trainer/issues/52)) ([3c2c273](https://github.com/wolasss/random-scale-trainer/commit/3c2c273b81800e00a4dee080ef75fc505242cc5f))

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
