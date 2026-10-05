# Playtest report

Runs with a trace: **1329** (slots 200-583); eval rows total 2391. Includes every A/B arm (mixed switch settings), so read section 9 for arm differences.

## 1. Endings
| reason | n | % |
|---|---|---|
| stuck | 507 | 38.1% |
| deaths | 200 | 15.0% |
| timeout | 606 | 45.6% |
| disconnected | 4 | 0.3% |
| lost | 12 | 0.9% |

Banked (deposited>0): 899 = 67.6%; runs with >=1 death: 51.5%

## 2. Progress funnel (% of runs reaching each milestone; median minute and y when reached)
| milestone | runs | % | median min | median y |
|---|---|---|---|---|
| wood | 1249 | 94.0% | 0.2 | 70 |
| cobble3 | 1220 | 91.8% | 1.8 | 64 |
| wooden_pick | 1230 | 92.6% | 1.3 | 69 |
| stone_pick | 1218 | 91.6% | 2 | 64 |
| iron_pick | 1136 | 85.5% | 7.3 | 16 |
| below_y0 | 1137 | 85.6% | 9.5 | -57 |
| diamond_depth | 1108 | 83.4% | 10.1 | -57 |
| first_diamond | 1037 | 78.0% | 15.8 | -57 |
| three_diamonds | 685 | 51.5% | 28.1 | -58 |
| deposited >=1 (min = run length) | 899 | 67.6% | 60 |  |

## 3. Highest stage reached vs ending
| stage | n | % | timeout | stuck | death/other | banked |
|---|---|---|---|---|---|---|
| 0 nothing | 80 | 6.0% | 1 | 63 | 16 | 0 |
| 1 got wood | 19 | 1.4% | 0 | 16 | 3 | 0 |
| 2 wooden pickaxe | 12 | 0.9% | 0 | 12 | 0 | 0 |
| 3 stone pickaxe | 82 | 6.2% | 5 | 49 | 28 | 0 |
| 4 iron pickaxe | 25 | 1.9% | 1 | 12 | 12 | 0 |
| 5 reached y<=-50 | 74 | 5.6% | 23 | 39 | 12 | 0 |
| 6 diamond mined | 1037 | 78.0% | 576 | 316 | 145 | 899 |

## 4. Where time goes (mean minutes per run by skill)
| skill | banked | not banked |
|---|---|---|
| explore | 22.7 | 11.3 |
| dig_down | 11.2 | 4.3 |
| go_up | 6.6 | 2.5 |
| shelter | 5.9 | 2.5 |
| mine | 3.8 | 2.1 |
| craft | 2.3 | 1.1 |
| smelt | 1.0 | 0.6 |
| return_home | 0.4 | 0.1 |
| hunt | 0.3 | 0.2 |
| eat | 0.1 | 0.4 |
| fight | 0.2 | 0.2 |
| flee | 0.1 | 0.2 |
| toss | 0.1 | 0.0 |
| deposit | 0.0 | 0.0 |

## 5. Why runs ended without banking
Not banked: 430 (32.4%)

| ending | n |
|---|---|
| stuck / last skill go_up / go_up:not_reached | 72 |
| stuck / last skill explore / explore:not_found | 32 |
| timeout / last skill explore / explore:not_found | 24 |
| stuck / last skill explore / dig_down:blocked | 19 |
| deaths / last skill flee / flee:timeout | 15 |
| stuck / last skill return_home / explore:not_found | 14 |
| deaths / last skill flee / shelter:not_sealed | 13 |
| deaths / last skill flee / fight:low_health | 12 |
| stuck / last skill craft / craft:no_tool | 10 |
| stuck / last skill return_home / return_home:no_path | 9 |
| stuck / last skill explore / explore:timeout | 9 |
| stuck / last skill go_up / go_up:no_progress | 7 |
| deaths / last skill flee / explore:attacked | 7 |
| deaths / last skill shelter / fight:low_health | 7 |
| stuck / last skill explore / go_up:not_reached | 6 |
| deaths / last skill flee / mine:attacked | 6 |
| stuck / last skill explore / explore:no_progress | 5 |
| stuck / last skill return_home / shelter:not_sealed | 5 |
| stuck / last skill return_home / go_up:suffocating | 5 |
| deaths / last skill flee / dig_down:attacked | 5 |
| stuck / last skill mine / mine:pickup_failed | 5 |
| stuck / last skill go_up / explore:hazard | 4 |
| stuck / last skill return_home / return_home:no_progress | 4 |
| stuck / last skill dig_down / explore:not_found | 4 |
| stuck / last skill go_up / mine:drowning | 4 |

## 6. Deaths
Total deaths 1011. Skill running just before the death was logged:

| prev skill | n | median y | median minute |
|---|---|---|---|
| shelter | 356 | 72 | 30 |
| flee | 318 | 70 | 24.4 |
| go_up | 200 | 68 | 27 |
| dig_down | 73 | 71 | 23.9 |
| explore | 24 | 69 | 33.6 |
| fight | 16 | 70 | 29.1 |
| mine | 14 | 68 | 9.8 |
| eat | 5 | 70 | 36.9 |
| return_home | 2 | 92 | 57.5 |
| craft | 2 | 141 | 28.3 |
| smelt | 1 | 82 | 10.1 |

## 7. Failure signatures (runs that hit each at least once)
| failSig | runs | % |
|---|---|---|
| explore:not_found | 1053 | 79.2% |
| explore:hazard | 778 | 58.5% |
| mine:reach_failed | 681 | 51.2% |
| explore:timeout | 630 | 47.4% |
| shelter:not_sealed | 380 | 28.6% |
| craft:timeout | 375 | 28.2% |
| dig_down:timeout | 340 | 25.6% |
| shelter:hostile_waiting | 324 | 24.4% |
| dig_down:blocked | 310 | 23.3% |
| go_up:attacked | 306 | 23.0% |
| dig_down:attacked | 263 | 19.8% |
| mine:pickup_failed | 258 | 19.4% |
| go_up:not_reached | 219 | 16.5% |
| explore:attacked | 212 | 16.0% |
| dig_down:no_tool | 194 | 14.6% |
| mine:dig_timeout | 176 | 13.2% |
| explore:no_tool | 153 | 11.5% |
| craft:craft_failed | 145 | 10.9% |
| mine:attacked | 140 | 10.5% |
| craft:no_tool | 116 | 8.7% |
| explore:no_progress | 95 | 7.1% |
| fight:low_health | 94 | 7.1% |
| shelter:no_tool | 80 | 6.0% |
| explore:undiggable | 79 | 5.9% |
| flee:timeout | 64 | 4.8% |

## 8. Banked vs not banked: median minute to milestone (among runs that reached it)
| milestone | banked | not banked |
|---|---|---|
| wood | 0.2 | 0.3 |
| cobble3 | 1.8 | 1.9 |
| wooden_pick | 1.3 | 1.4 |
| stone_pick | 2 | 2 |
| iron_pick | 7.1 | 7.9 |
| below_y0 | 9.4 | 10 |
| diamond_depth | 9.9 | 10.9 |
| first_diamond | 15.4 | 20.2 |
| three_diamonds | 28.5 | 14.5 |

## 9. By arm
| arm | n | banked | timeout | stuck | death-end | mean max diamonds held |
|---|---|---|---|---|---|---|
| watchdog=0 | 144 | 70.1% | 47.9% | 34.0% | 18.1% | 3.35 |
| watchdog=1 | 48 | 58.3% | 35.4% | 56.3% | 8.3% | 3.48 |
| recovery=0 | 96 | 62.5% | 45.8% | 35.4% | 18.8% | 2.84 |
| recovery=1 | 96 | 67.7% | 44.8% | 35.4% | 19.8% | 3.52 |
| branchY=-53 | 48 | 58.3% | 33.3% | 35.4% | 31.3% | 3.10 |
| branchY=-58 | 48 | 60.4% | 31.3% | 47.9% | 20.8% | 3.33 |
| watchdog=3 | 48 | 70.8% | 47.9% | 43.8% | 8.3% | 2.83 |
| watchdog=5 | 48 | 52.1% | 31.3% | 62.5% | 6.3% | 2.85 |
| drownCap=0 | 60 | 85.0% | 53.3% | 35.0% | 11.7% | 3.68 |
| drownCap=1 | 60 | 76.7% | 58.3% | 28.3% | 13.3% | 3.52 |
| stationAbove=1 | 48 | 68.8% | 62.5% | 31.3% | 6.3% | 3.92 |
| stationAbove=0 | 48 | 70.8% | 35.4% | 43.8% | 20.8% | 3.73 |
| spawnEscape=1 | 38 | 65.8% | 52.6% | 26.3% | 21.1% | 3.29 |
| spawnEscape=0 | 36 | 72.2% | 55.6% | 25.0% | 19.4% | 3.47 |
| veinScan=1 | 95 | 71.6% | 43.2% | 42.1% | 14.7% | 9.79 |
| veinScan=0 | 90 | 65.6% | 47.8% | 36.7% | 15.6% | 3.20 |
| earlyBank=1 | 38 | 63.2% | 42.1% | 31.6% | 26.3% | 3.29 |
| earlyBank=0 | 36 | 61.1% | 38.9% | 52.8% | 8.3% | 3.19 |
| spawnWalk=1 | 72 | 66.7% | 50.0% | 37.5% | 12.5% | 3.26 |
| spawnWalk=0 | 60 | 65.0% | 45.0% | 40.0% | 15.0% | 3.53 |
| pickReady=1 | 36 | 66.7% | 41.7% | 36.1% | 22.2% | 2.92 |
| pickReady=0 | 36 | 83.3% | 50.0% | 30.6% | 19.4% | 3.94 |

## 10. Case studies (full decision-by-decision timelines in timelines/)

### FAST BANK
```
slot 326 [watchdog=0] deaths, deposited 2, deaths 3, 14.8 min, stage "6 diamond mined"
  - wood: min 0.4, y 104, pos 2070,104,12301
  - cobble3: min 1.7, y 92, pos 2106,92,12328
  - wooden_pick: min 1.3, y 100, pos 2085,100,12308
  - stone_pick: min 1.8, y 92, pos 2106,92,12328
  - iron_pick: min 6.4, y 16, pos 2100,16,12302
  - below_y0: min 9.4, y -45, pos 2129,-45,12302
  - first_diamond: min 9.4, y -45, pos 2129,-45,12302
  - start 2048,110,12288, end 2098,109,12289, travelled 483 blocks (max 84 from spawn)
  - time by skill: dig_down 5.7m, go_up 2.3m, explore 1.9m, mine 1.6m, craft 0.7m
  - deaths: 13m y110 after flee; 14.2m y110 after flee
  - failSigs: {"fight:low_health":1}
  - last decisions:
      13.7m fight y108 hp17.5 f20 FAIL:mine:attacked
      13.7m mine y108 hp15.499999046325684 f20 FAIL:mine:attacked
      13.8m fight y108 hp16.5 f19 FAIL:mine:attacked
      14m flee y107 hp10 f17 FAIL:mine:attacked
      14.2m dig_down y110 hp20 f20 FAIL:mine:attacked
      14.2m explore y109 hp20 f20 FAIL:mine:attacked
      14.5m fight y109 hp20 f20 FAIL:mine:attacked
      14.6m flee y109 hp3.1666669845581055 f20 FAIL:fight:low_health
```
```
slot 529 [spawnWalk=0] stuck, deposited 2, deaths 3, 15 min, stage "6 diamond mined"
  - wood: min 0.3, y 63, pos -15393,63,-10215
  - cobble3: min 1.5, y 54, pos -15393,54,-10212
  - wooden_pick: min 1.1, y 63, pos -15395,63,-10213
  - stone_pick: min 1.6, y 54, pos -15393,54,-10212
  - iron_pick: min 4.2, y 17, pos -15392,17,-10214
  - below_y0: min 7, y -57, pos -15390,-57,-10192
  - diamond_depth: min 7, y -57, pos -15390,-57,-10192
  - first_diamond: min 9.8, y -57, pos -15396,-57,-10194
  - start -15360,64,-10240, end -15360,64,-10240, travelled 237 blocks (max 79 from spawn)
  - time by skill: dig_down 4.1m, explore 3.4m, go_up 2.8m, mine 1.8m, smelt 0.7m
  - deaths: 14.3m y64 after flee; 14.6m y64 after flee
  - failSigs: {}
  - last decisions:
      13.5m return_home y64 hp20 f17 FAIL:explore:hazard
      13.8m fight y64 hp20 f17 FAIL:explore:hazard
      13.8m deposit y64 hp16 f17 FAIL:explore:hazard
      13.9m shelter y64 hp16 f17 FAIL:explore:hazard
      14m shelter y64 hp5.5 f17 FAIL:shelter:not_sealed
      14m flee y64 hp5.5 f17 FAIL:shelter:not_sealed
      14.3m flee y64 hp11.333333969116211 f19 FAIL:flee:timeout
      14.6m flee y64 hp18 f20 FAIL:flee:timeout
```
```
slot 381 [recovery=0] lost, deposited 4, deaths 1, 18.1 min, stage "6 diamond mined"
  - wood: min 0.1, y 68, pos 1,68,13313
  - cobble3: min 2, y 62, pos 11,62,13324
  - wooden_pick: min 1.7, y 64, pos 4,64,13329
  - stone_pick: min 2.1, y 62, pos 10,62,13324
  - iron_pick: min 6.2, y 14, pos -12,14,13316
  - below_y0: min 7.9, y -58, pos -12,-58,13316
  - diamond_depth: min 7.9, y -58, pos -12,-58,13316
  - first_diamond: min 12.7, y -58, pos -19,-58,13351
  - three_diamonds: min 13, y -59, pos -19,-59,13349
  - start 0,68,13312, end -1,68,13313, travelled 353 blocks (max 67 from spawn)
  - time by skill: explore 8.2m, dig_down 3.2m, go_up 2.3m, mine 2.3m, craft 1.0m
  - deaths: none
  - failSigs: {"mine:reach_failed":1,"mine:drowning":1,"explore:hazard":5,"explore:not_found":8,"explore:timeout":2,"shelter:not_sealed":5,"dig_down:blocked":1}
  - last decisions:
      15.7m shelter y-59 hp20 f20 FAIL:shelter:not_sealed
      15.7m shelter y-59 hp20 f20 FAIL:shelter:not_sealed
      15.7m go_up y-59 hp20 f20 FAIL:shelter:not_sealed
      17.8m return_home y69 hp20 f20 FAIL:shelter:not_sealed
      17.8m deposit y69 hp20 f20 FAIL:shelter:not_sealed
      17.8m dig_down y70 hp20 f20 FAIL:shelter:not_sealed
      17.9m shelter y70 hp20 f20 FAIL:dig_down:blocked
      17.9m shelter y68 hp20 f20 FAIL:shelter:not_sealed
```
```
slot 454 [recovery=0] stuck, deposited 2, deaths 0, 19.2 min, stage "6 diamond mined"
  - wood: min 0.1, y 71, pos -14335,71,-3070
  - cobble3: min 1.6, y 65, pos -14346,65,-3075
  - wooden_pick: min 1, y 71, pos -14341,71,-3064
  - stone_pick: min 1.9, y 65, pos -14346,65,-3075
  - iron_pick: min 11.3, y 15, pos -14307,15,-3028
  - below_y0: min 12.9, y -56, pos -14305,-56,-3028
  - diamond_depth: min 12.9, y -56, pos -14305,-56,-3028
  - first_diamond: min 14, y -56, pos -14326,-56,-3028
  - start -14336,71,-3072, end -14336,69,-3074, travelled 463 blocks (max 59 from spawn)
  - time by skill: explore 8.5m, dig_down 3.2m, go_up 2.8m, mine 2.0m, craft 1.5m
  - deaths: none
  - failSigs: {"craft:craft_failed":2,"explore:not_found":16,"mine:reach_failed":2,"explore:timeout":1,"shelter:not_sealed":6,"dig_down:attacked":1,"deposit:no_chest":2}
  - last decisions:
      19m fight y68 hp19 f20 FAIL:dig_down:attacked
      19.1m craft y68 hp20 f20 FAIL:dig_down:attacked
      19.1m craft y68 hp20 f20 FAIL:dig_down:attacked
      19.1m craft y68 hp20 f20 FAIL:dig_down:attacked
      19.1m craft y68 hp20 f20 FAIL:dig_down:attacked
      19.2m deposit y69 hp20 f20 FAIL:dig_down:attacked
      19.2m deposit y69 hp20 f20 FAIL:deposit:no_chest
      19.2m deposit y69 hp20 f20 FAIL:deposit:no_chest
```

### SLOW BANK
```
slot 302 [watchdog=0] timeout, deposited 2, deaths 2, 60.5 min, stage "6 diamond mined"
  - wood: min 0.5, y 64, pos 3078,64,-11304
  - cobble3: min 2.7, y 60, pos 3105,60,-11324
  - wooden_pick: min 2.5, y 64, pos 3102,64,-11324
  - stone_pick: min 2.9, y 60, pos 3105,60,-11324
  - iron_pick: min 6.6, y 16, pos 3087,16,-11335
  - below_y0: min 9.6, y -49, pos 3065,-49,-11332
  - diamond_depth: min 9.8, y -56, pos 3065,-56,-11332
  - first_diamond: min 14.7, y -57, pos 3083,-57,-11344
  - three_diamonds: min 42.9, y -56, pos 3107,-56,-11209
  - start 3072,77,-11264, end 3029,57,-11263, travelled 1341 blocks (max 83 from spawn)
  - time by skill: explore 21.0m, dig_down 15.0m, mine 7.7m, go_up 5.9m, shelter 4.8m
  - deaths: 45.8m y77 after shelter; 56.3m y77 after shelter
  - failSigs: {"dig_down:no_tool":2,"shelter:not_sealed":4,"mine:drowning":1,"mine:reach_failed":1,"mine:pickup_failed":1}
  - last decisions:
      58.7m craft y63 hp15.100515365600586 f17 FAIL:mine:pickup_failed
      58.8m mine y63 hp15.100515365600586 f17 FAIL:mine:pickup_failed
      58.8m dig_down y63 hp15.100515365600586 f17 FAIL:mine:pickup_failed
      58.9m mine y60 hp15.100515365600586 f17 FAIL:mine:pickup_failed
      58.9m mine y59 hp15.100515365600586 f17 FAIL:mine:pickup_failed
      59m mine y58 hp15.100515365600586 f17 FAIL:mine:pickup_failed
      59m craft y57 hp15.100515365600586 f17 FAIL:mine:pickup_failed
      59.1m dig_down y57 hp15.100515365600586 f17 FAIL:mine:pickup_failed
```
```
slot 307 [watchdog=0] timeout, deposited 8, deaths 0, 60.5 min, stage "6 diamond mined"
  - wood: min 0.3, y 79, pos 12319,79,-11266
  - cobble3: min 2.4, y 75, pos 12309,75,-11261
  - wooden_pick: min 1.4, y 76, pos 12320,76,-11281
  - stone_pick: min 2.5, y 75, pos 12309,75,-11261
  - iron_pick: min 5.1, y 16, pos 12311,16,-11265
  - below_y0: min 7.1, y -59, pos 12315,-59,-11265
  - diamond_depth: min 7.1, y -59, pos 12315,-59,-11265
  - first_diamond: min 22.2, y -59, pos 12351,-59,-11257
  - three_diamonds: min 44.6, y -61, pos 12392,-61,-11284
  - start 12288,84,-11264, end 12293,-59,-11232, travelled 1106 blocks (max 107 from spawn)
  - time by skill: explore 32.0m, dig_down 11.9m, go_up 7.2m, mine 3.0m, craft 2.2m
  - deaths: none
  - failSigs: {"explore:not_found":35,"explore:timeout":3,"mine:reach_failed":1,"explore:undiggable":2,"go_up:suffocating":2,"dig_down:timeout":1,"shelter:hostile_waiting":1}
  - last decisions:
      55.1m dig_down y84 hp20 f18 FAIL:shelter:hostile_waiting
      55.2m dig_down y80 hp20 f18 FAIL:shelter:hostile_waiting
      57.6m craft y-59 hp20 f18 FAIL:shelter:hostile_waiting
      57.7m explore y-59 hp20 f18 FAIL:shelter:hostile_waiting
      59.1m toss y-59 hp20 f18 FAIL:explore:not_found
      59.1m explore y-59 hp20 f18 FAIL:explore:not_found
      59.3m toss y-59 hp20 f18 FAIL:explore:not_found
      59.3m explore y-59 hp20 f18 FAIL:explore:not_found
```
```
slot 301 [watchdog=0] timeout, deposited 6, deaths 1, 60.5 min, stage "6 diamond mined"
  - wood: min 0.3, y 68, pos 2051,68,-11266
  - cobble3: min 2, y 59, pos 2054,59,-11257
  - wooden_pick: min 0.7, y 68, pos 2051,68,-11266
  - stone_pick: min 2.1, y 59, pos 2054,59,-11257
  - iron_pick: min 6.1, y 16, pos 2082,16,-11240
  - below_y0: min 7.3, y -13, pos 2097,-13,-11240
  - diamond_depth: min 9.5, y -58, pos 2109,-58,-11226
  - first_diamond: min 12.1, y -59, pos 2129,-59,-11224
  - three_diamonds: min 15.8, y -59, pos 2075,-59,-11220
  - start 2048,68,-11264, end 2048,65,-11262, travelled 961 blocks (max 106 from spawn)
  - time by skill: explore 20.9m, dig_down 13.9m, go_up 10.3m, mine 5.7m, shelter 3.0m
  - deaths: 42.8m y69 after go_up
  - failSigs: {"mine:dig_timeout":1,"mine:pickup_failed":1,"mine:reach_failed":1,"go_up:suffocating":3}
  - last decisions:
      56.3m go_up y47 hp10.333332061767578 f16 FAIL:go_up:suffocating
      57.3m return_home y69 hp10.333332061767578 f16 FAIL:go_up:suffocating
      57.4m deposit y68 hp10.333332061767578 f16 FAIL:go_up:suffocating
      57.4m dig_down y68 hp10.333332061767578 f16 FAIL:go_up:suffocating
      57.4m craft y65 hp10.333332061767578 f16 FAIL:go_up:suffocating
      57.5m craft y65 hp10.333332061767578 f16 FAIL:go_up:suffocating
      57.5m craft y65 hp10.333332061767578 f16 FAIL:go_up:suffocating
      57.6m dig_down y65 hp10.333332061767578 f16 FAIL:go_up:suffocating
```

### STUCK no pickaxe
```
slot 230 [drownCap=1] stuck, deposited 0, deaths 2, 34.1 min, stage "0 nothing"

  - start -10240,64,-4096, end -10287,62,-4135, travelled 2755 blocks (max 319 from spawn)
  - time by skill: explore 30.5m, flee 1.6m, mine 0.7m, dig_down 0.6m, hunt 0.2m
  - deaths: 31.5m y64 after explore; 33m y64 after flee
  - failSigs: {"explore:not_found":3,"explore:attacked":1,"dig_down:attacked":1}
  - last decisions:
      33.4m explore y62 hp20 f20 FAIL:explore:not_found
      33.7m fight y65 hp17.5 f20 FAIL:explore:attacked
      33.7m dig_down y65 hp15.5 f20 FAIL:explore:attacked
      33.7m flee y64 hp13 f20 FAIL:dig_down:attacked
      33.8m dig_down y66 hp14 f19 FAIL:dig_down:attacked
      33.9m explore y62 hp15 f17 FAIL:dig_down:attacked
      33.9m explore y62 hp15 f17 FAIL:explore:not_found
      33.9m explore y62 hp15 f17 FAIL:explore:not_found
```
```
slot 412 [veinScan=1] stuck, deposited 0, deaths 0, 2.5 min, stage "1 got wood"
  - wood: min 2.2, y 118, pos 7120,118,-13385
  - start 7168,167,-13312, end 7120,119,-13387, travelled 386 blocks (max 89 from spawn)
  - time by skill: explore 1.9m, mine 0.3m, go_up 0.2m, craft 0.1m
  - deaths: none
  - failSigs: {"explore:not_found":3,"go_up:not_reached":2}
  - last decisions:
      2.2m mine y118 hp20 f20 FAIL:explore:not_found
      2.3m craft y118 hp20 f20 FAIL:explore:not_found
      2.3m craft y118 hp20 f20 FAIL:explore:not_found
      2.3m craft y118 hp20 f20 FAIL:explore:not_found
      2.4m craft y118 hp20 f20 FAIL:explore:not_found
      2.4m go_up y118 hp20 f20 FAIL:explore:not_found
      2.5m go_up y119 hp20 f20 FAIL:go_up:not_reached
      2.5m go_up y119 hp20 f20 FAIL:go_up:not_reached
```
```
slot 493 [spawnWalk=1] stuck, deposited 0, deaths 0, 2.3 min, stage "0 nothing"

  - start 15360,89,12288, end 15402,70,12241, travelled 193 blocks (max 73 from spawn)
  - time by skill: explore 1.8m, go_up 0.3m
  - deaths: none
  - failSigs: {"explore:not_found":10,"go_up:not_reached":1}
  - last decisions:
      1m explore y68 hp20 f20 FAIL:explore:not_found
      1.1m explore y70 hp20 f20 FAIL:explore:not_found
      1.2m explore y68 hp20 f20 FAIL:explore:not_found
      1.4m explore y70 hp20 f20 FAIL:explore:not_found
      1.6m explore y68 hp20 f20 FAIL:explore:not_found
      1.8m explore y70 hp20 f20 FAIL:explore:not_found
      2m explore y68 hp20 f20 FAIL:explore:not_found
      2.2m explore y70 hp20 f20 FAIL:explore:not_found
```

### STUCK stone pick no diamond
```
slot 202 [drownCap=0] stuck, deposited 0, deaths 0, 8.7 min, stage "3 stone pickaxe"
  - wood: min 0.5, y 69, pos 5128,69,-9214
  - cobble3: min 2.7, y 66, pos 5126,66,-9255
  - wooden_pick: min 1.9, y 70, pos 5147,70,-9237
  - stone_pick: min 2.9, y 66, pos 5126,66,-9255
  - start 5120,70,-9216, end 5113,16,-9231, travelled 281 blocks (max 59 from spawn)
  - time by skill: explore 3.5m, mine 1.9m, dig_down 1.4m, craft 0.8m, hunt 0.6m
  - deaths: none
  - failSigs: {"explore:not_found":8,"smelt:attacked":1,"shelter:not_sealed":1,"explore:error":2}
  - last decisions:
      8.3m craft y15 hp20 f20 FAIL:explore:not_found
      8.3m craft y15 hp20 f20 FAIL:explore:not_found
      8.4m smelt y16 hp20 f20 FAIL:explore:not_found
      8.5m shelter y16 hp17.5 f20 FAIL:smelt:attacked
      8.6m fight y16 hp20 f20 FAIL:shelter:not_sealed
      8.7m explore y16 hp20 f20 FAIL:shelter:not_sealed
      8.7m explore y16 hp20 f20 FAIL:explore:error
      8.7m explore y16 hp20 f20 FAIL:explore:error
```
```
slot 334 [watchdog=1] stuck, deposited 0, deaths 0, 10.1 min, stage "3 stone pickaxe"
  - wood: min 0.1, y 64, pos -12288,64,10242
  - cobble3: min 0.9, y 56, pos -12284,56,10243
  - wooden_pick: min 0.5, y 64, pos -12286,64,10241
  - stone_pick: min 1.1, y 56, pos -12283,56,10243
  - start -12288,64,10240, end -12243,52,10259, travelled 207 blocks (max 49 from spawn)
  - time by skill: explore 4.8m, go_up 1.9m, dig_down 1.2m, craft 1.2m, mine 0.7m
  - deaths: none
  - failSigs: {"explore:no_progress":1,"explore:not_found":4,"explore:hazard":2,"go_up:no_progress":1,"explore:no_path":1,"go_up:not_reached":2}
  - last decisions:
      5.2m go_up y16 hp20 f20 FAIL:explore:hazard
      6.2m explore y56 hp20 f20 FAIL:go_up:no_progress
      8m craft y56 hp20 f20 FAIL:explore:not_found
      8.1m explore y56 hp20 f20 FAIL:explore:not_found
      8.8m craft y50 hp20 f20 FAIL:explore:no_path
      9.1m go_up y50 hp20 f20 FAIL:explore:no_path
      9.8m go_up y52 hp10.5 f17 FAIL:go_up:not_reached
      10m go_up y52 hp10.5 f17 FAIL:go_up:not_reached
```
```
slot 433 [veinScan=1] stuck, deposited 0, deaths 1, 14.7 min, stage "4 iron pickaxe"
  - wood: min 0.2, y 72, pos 9216,72,14348
  - cobble3: min 1.7, y 65, pos 9219,65,14342
  - wooden_pick: min 1.3, y 70, pos 9223,70,14347
  - stone_pick: min 1.8, y 65, pos 9219,65,14342
  - iron_pick: min 14, y 14, pos 9248,14,14282
  - below_y0: min 14.7, y -9, pos 9259,-9,14282
  - start 9216,71,14336, end 9259,-9,14282, travelled 424 blocks (max 69 from spawn)
  - time by skill: dig_down 5.5m, mine 4.2m, explore 2.1m, craft 1.5m, go_up 0.7m
  - deaths: 4.2m y71 after dig_down
  - failSigs: {"mine:dig_timeout":1,"dig_down:blocked":7,"explore:hazard":5,"explore:not_found":4,"mine:drowning":2,"explore:no_floor":3,"mine:attacked":1,"shelter:not_sealed":2,"explore:attacked":1}
  - last decisions:
      13.2m craft y14 hp20 f17 FAIL:explore:hazard
      13.3m explore y14 hp20 f17 FAIL:explore:hazard
      13.5m mine y14 hp20 f17 FAIL:explore:hazard
      13.7m smelt y14 hp20 f17 FAIL:explore:hazard
      13.9m craft y14 hp20 f17 FAIL:explore:hazard
      14m dig_down y14 hp20 f17 FAIL:explore:hazard
      14.7m dig_down y-9 hp20 f17 FAIL:dig_down:blocked
      14.7m explore y-9 hp20 f17 FAIL:dig_down:blocked
```
```
slot 503 [veinScan=1] stuck, deposited 0, deaths 0, 5.8 min, stage "3 stone pickaxe"
  - wood: min 0.3, y 63, pos 10,63,15362
  - cobble3: min 2.1, y 58, pos 47,58,15340
  - wooden_pick: min 1.7, y 62, pos 15,62,15343
  - stone_pick: min 2.3, y 58, pos 47,58,15340
  - start 0,63,15360, end 55,62,15328, travelled 190 blocks (max 81 from spawn)
  - time by skill: mine 1.8m, dig_down 1.4m, explore 1.4m, go_up 0.6m, craft 0.6m
  - deaths: none
  - failSigs: {"explore:hazard":2,"explore:no_tool":1,"explore:not_found":6,"dig_down:blocked":5}
  - last decisions:
      5.5m explore y62 hp20 f20 FAIL:dig_down:blocked
      5.5m explore y62 hp20 f20 FAIL:explore:not_found
      5.7m dig_down y62 hp20 f20 FAIL:explore:not_found
      5.7m explore y62 hp20 f20 FAIL:dig_down:blocked
      5.7m dig_down y62 hp20 f20 FAIL:explore:not_found
      5.7m explore y62 hp20 f20 FAIL:dig_down:blocked
      5.8m dig_down y62 hp20 f20 FAIL:explore:not_found
      5.8m explore y62 hp20 f20 FAIL:dig_down:blocked
```

### TIMEOUT no diamond
```
slot 218 [drownCap=1] timeout, deposited 0, deaths 2, 60.4 min, stage "5 reached y<=-50"
  - wood: min 0.3, y 104, pos 3066,104,10255
  - cobble3: min 2.2, y 98, pos 3083,98,10250
  - wooden_pick: min 1.9, y 110, pos 3079,110,10250
  - stone_pick: min 2.4, y 98, pos 3083,98,10250
  - iron_pick: min 7, y 16, pos 3089,16,10242
  - below_y0: min 8.8, y -59, pos 3089,-59,10242
  - diamond_depth: min 8.8, y -59, pos 3089,-59,10242
  - start 3072,102,10240, end 3126,-59,10119, travelled 828 blocks (max 133 from spawn)
  - time by skill: dig_down 21.1m, shelter 10.8m, explore 10.6m, mine 5.8m, craft 4.4m
  - deaths: 28.5m y102 after shelter; 35.3m y102 after shelter
  - failSigs: {"mine:attacked":2,"shelter:not_sealed":3,"hunt:not_killed":2,"dig_down:timeout":1,"explore:not_found":4,"explore:hazard":1}
  - last decisions:
      54.2m eat y-59 hp19 f16 FAIL:shelter:not_sealed
      54.3m explore y-59 hp19 f18 FAIL:shelter:not_sealed
      55.9m explore y-59 hp20 f18 FAIL:explore:not_found
      56m explore y-59 hp20 f18 FAIL:explore:not_found
      57.5m explore y-59 hp20 f18 FAIL:explore:hazard
      58.9m craft y-59 hp20 f18 FAIL:explore:not_found
      59m explore y-59 hp20 f18 FAIL:explore:not_found
      59.2m explore y-59 hp20 f18 FAIL:explore:not_found
```
```
slot 355 [recovery=1] timeout, deposited 0, deaths 2, 60 min, stage "5 reached y<=-50"
  - wood: min 0.2, y 113, pos 7171,113,-12289
  - cobble3: min 2, y 103, pos 7156,103,-12271
  - wooden_pick: min 1.3, y 112, pos 7167,112,-12280
  - stone_pick: min 2.1, y 104, pos 7156,104,-12271
  - iron_pick: min 7.8, y 16, pos 7184,16,-12266
  - below_y0: min 8.8, y -2, pos 7194,-2,-12266
  - diamond_depth: min 46.3, y -57, pos 7153,-57,-12329
  - start 7168,113,-12288, end 7194,-57,-12307, travelled 1263 blocks (max 79 from spawn)
  - time by skill: explore 21.9m, dig_down 13.3m, shelter 10.1m, mine 5.0m, craft 3.5m
  - deaths: 9.1m y113 after shelter; 27.5m y113 after shelter
  - failSigs: {"mine:reach_failed":5,"hunt:not_killed":1,"explore:not_found":15,"explore:hazard":3,"explore:timeout":1}
  - last decisions:
      58.5m explore y-57 hp20 f20 FAIL:explore:hazard
      59.7m toss y-57 hp20 f20 FAIL:explore:not_found
      59.7m craft y-57 hp20 f20 FAIL:explore:not_found
      59.7m craft y-57 hp20 f20 FAIL:explore:not_found
      59.8m toss y-57 hp20 f20 FAIL:explore:not_found
      59.8m explore y-57 hp20 f20 FAIL:explore:not_found
      59.9m mine y-57 hp20 f20 FAIL:explore:not_found
      60m explore y-57 hp20 f20 FAIL:mine:reach_failed
```
```
slot 475 [recovery=0] timeout, deposited 0, deaths 0, 60.5 min, stage "5 reached y<=-50"
  - wood: min 0.2, y 77, pos 4096,77,-14343
  - cobble3: min 1.8, y 66, pos 4088,66,-14343
  - wooden_pick: min 1.4, y 73, pos 4086,73,-14345
  - stone_pick: min 1.9, y 67, pos 4087,67,-14343
  - iron_pick: min 6.9, y 14, pos 4104,14,-14338
  - below_y0: min 8.5, y -58, pos 4104,-58,-14338
  - diamond_depth: min 8.5, y -58, pos 4104,-58,-14338
  - start 4096,74,-14336, end 4156,-30,-14309, travelled 1430 blocks (max 66 from spawn)
  - time by skill: explore 47.5m, dig_down 3.3m, go_up 3.0m, craft 2.9m, mine 1.6m
  - deaths: none
  - failSigs: {"explore:not_found":58,"explore:timeout":9,"craft:timeout":2,"explore:hazard":8,"explore:no_tool":16,"craft:no_tool":1}
  - last decisions:
      55.9m explore y-30 hp20 f20 FAIL:explore:hazard
      57.1m explore y-30 hp20 f20 FAIL:explore:not_found
      57.2m explore y-30 hp20 f20 FAIL:explore:not_found
      58m craft y-30 hp20 f20 FAIL:explore:timeout
      58.1m explore y-30 hp20 f20 FAIL:explore:timeout
      58.1m explore y-30 hp20 f20 FAIL:explore:not_found
      59.3m explore y-30 hp20 f20 FAIL:explore:not_found
      59.4m explore y-30 hp20 f20 FAIL:explore:not_found
```
```
slot 519 [spawnWalk=0] timeout, deposited 0, deaths 0, 60.5 min, stage "5 reached y<=-50"
  - wood: min 6.6, y 62, pos -15442,62,8117
  - cobble3: min 8.2, y 67, pos -15452,67,8107
  - wooden_pick: min 8, y 67, pos -15455,67,8112
  - stone_pick: min 8.3, y 67, pos -15452,67,8109
  - iron_pick: min 13.8, y 15, pos -15462,15,8113
  - below_y0: min 16.2, y -58, pos -15445,-58,8113
  - diamond_depth: min 16.2, y -58, pos -15445,-58,8113
  - start -15360,78,8192, end -15461,-58,8088, travelled 1999 blocks (max 186 from spawn)
  - time by skill: explore 40.3m, dig_down 6.4m, go_up 5.2m, mine 3.9m, craft 2.5m
  - deaths: none
  - failSigs: {"explore:not_found":56,"explore:timeout":6,"go_up:not_reached":1,"explore:hazard":5,"craft:timeout":3,"mine:reach_failed":3,"explore:no_tool":9,"explore:no_floor":1,"craft:no_tool":1,"shelter:not_sealed":4}
  - last decisions:
      56.4m dig_down y72 hp20 f20 FAIL:explore:not_found
      57.4m explore y16 hp20 f20 FAIL:explore:not_found
      57.4m mine y16 hp20 f20 FAIL:explore:not_found
      57.8m smelt y18 hp20 f20 FAIL:explore:not_found
      58m craft y18 hp20 f20 FAIL:explore:not_found
      58.1m dig_down y18 hp20 f20 FAIL:explore:not_found
      59.7m explore y-58 hp20 f20 FAIL:explore:not_found
      59.8m explore y-58 hp20 f20 FAIL:explore:not_found
```

### TIMEOUT diamond not banked
```
slot 220 [drownCap=1] timeout, deposited 0, deaths 0, 60 min, stage "6 diamond mined"
  - wood: min 1.9, y 63, pos -50,63,10331
  - cobble3: min 2.7, y 60, pos -68,60,10349
  - wooden_pick: min 2.5, y 64, pos -71,64,10349
  - stone_pick: min 3, y 60, pos -69,60,10349
  - iron_pick: min 10, y 17, pos -85,17,10363
  - below_y0: min 12.2, y -59, pos -71,-59,10363
  - diamond_depth: min 12.2, y -59, pos -71,-59,10363
  - first_diamond: min 13.7, y -59, pos -71,-59,10394
  - three_diamonds: min 14.1, y -59, pos -69,-59,10393
  - start 0,67,10240, end -82,18,10367, travelled 589 blocks (max 189 from spawn)
  - time by skill: eat 38.6m, explore 8.9m, shelter 3.7m, dig_down 3.3m, mine 2.1m
  - deaths: none
  - failSigs: {"explore:not_found":11,"craft:craft_failed":1,"explore:hazard":1,"explore:timeout":2,"go_up:attacked":3,"shelter:not_sealed":1,"eat:error":2,"fight:not_killed":1}
  - last decisions:
      60m eat y18 hp9.999998092651367 f16 FAIL:fight:not_killed
      60m eat y18 hp9.999998092651367 f16 FAIL:fight:not_killed
      60m eat y18 hp9.999998092651367 f16 FAIL:fight:not_killed
      60m eat y18 hp9.999998092651367 f16 FAIL:fight:not_killed
      60m eat y18 hp9.999998092651367 f16 FAIL:fight:not_killed
      60m eat y18 hp9.999998092651367 f16 FAIL:fight:not_killed
      60m eat y18 hp9.999998092651367 f16 FAIL:fight:not_killed
      60m eat y18 hp9.999998092651367 f16 FAIL:fight:not_killed
```
```
slot 341 [watchdog=0] timeout, deposited 0, deaths 2, 60.5 min, stage "6 diamond mined"
  - wood: min 0.2, y 125, pos -10239,125,-12288
  - cobble3: min 2.4, y 103, pos -10261,103,-12282
  - wooden_pick: min 1.1, y 121, pos -10248,121,-12287
  - stone_pick: min 2.5, y 103, pos -10261,103,-12282
  - iron_pick: min 9, y -1, pos -10272,-1,-12296
  - below_y0: min 8.7, y -1, pos -10272,-1,-12297
  - diamond_depth: min 10.5, y -59, pos -10269,-59,-12296
  - first_diamond: min 14.7, y -59, pos -10266,-59,-12304
  - start -10240,124,-12288, end -10111,-59,-12307, travelled 1030 blocks (max 130 from spawn)
  - time by skill: explore 15.7m, dig_down 13.3m, shelter 10.8m, mine 6.9m, go_up 5.9m
  - deaths: 26.7m y124 after shelter; 35.4m y125 after go_up
  - failSigs: {"mine:reach_failed":3,"go_up:attacked":1,"explore:attacked":1,"eat:error":1,"hunt:not_killed":1,"explore:no_tool":1,"explore:not_found":8,"dig_down:attacked":1,"explore:timeout":2}
  - last decisions:
      56.2m explore y-59 hp20 f19 FAIL:explore:not_found
      57.9m explore y-59 hp20 f19 FAIL:explore:not_found
      58m explore y-59 hp20 f19 FAIL:explore:not_found
      59.1m craft y-59 hp20 f19 FAIL:explore:timeout
      59.1m craft y-59 hp20 f19 FAIL:explore:timeout
      59.1m craft y-59 hp20 f19 FAIL:explore:timeout
      59.2m explore y-59 hp20 f19 FAIL:explore:timeout
      59.4m explore y-59 hp20 f19 FAIL:explore:not_found
```
```
slot 497 [watchdog=5] timeout, deposited 0, deaths 1, 60.5 min, stage "6 diamond mined"
  - wood: min 0.1, y 64, pos 12288,64,15354
  - cobble3: min 2.2, y 68, pos 12346,68,15372
  - wooden_pick: min 1.1, y 64, pos 12285,64,15349
  - stone_pick: min 2.3, y 69, pos 12346,69,15372
  - iron_pick: min 9.2, y -10, pos 12344,-10,15358
  - below_y0: min 8.4, y -8, pos 12343,-8,15353
  - diamond_depth: min 12.2, y -57, pos 12358,-57,15371
  - first_diamond: min 44.9, y -59, pos 12378,-59,15365
  - start 12288,64,15360, end 12324,60,15322, travelled 1056 blocks (max 95 from spawn)
  - time by skill: explore 30.9m, shelter 9.0m, dig_down 5.8m, go_up 4.8m, mine 4.7m
  - deaths: 49m y64 after go_up
  - failSigs: {}
  - last decisions:
      58.7m shelter y60 hp20 f20 FAIL:mine:pickup_failed
      59.4m craft y60 hp20 f20 FAIL:mine:pickup_failed
      59.5m craft y60 hp20 f20 FAIL:mine:pickup_failed
      59.5m craft y60 hp20 f20 FAIL:mine:pickup_failed
      59.6m craft y60 hp20 f20 FAIL:mine:pickup_failed
      59.6m craft y60 hp20 f20 FAIL:mine:pickup_failed
      59.6m craft y60 hp20 f20 FAIL:mine:pickup_failed
      59.6m dig_down y60 hp20 f20 FAIL:mine:pickup_failed
```

### DIED not banked
```
slot 202 [drownCap=1] deaths, deposited 0, deaths 10, 35.8 min, stage "6 diamond mined"
  - wood: min 0.4, y 69, pos 5130,69,-9214
  - cobble3: min 2.3, y 64, pos 5173,64,-9226
  - wooden_pick: min 1.5, y 68, pos 5159,68,-9220
  - stone_pick: min 2.4, y 64, pos 5173,64,-9226
  - iron_pick: min 8.6, y -1, pos 5181,-1,-9194
  - below_y0: min 8.4, y -1, pos 5184,-1,-9196
  - diamond_depth: min 29.1, y -59, pos 5132,-59,-9183
  - first_diamond: min 29.1, y -59, pos 5132,-59,-9183
  - start 5120,70,-9216, end 5119,53,-9183, travelled 569 blocks (max 82 from spawn)
  - time by skill: shelter 8.2m, mine 6.4m, explore 6.4m, dig_down 5.5m, go_up 2.5m
  - deaths: 9.5m y70 after flee; 11.6m y70 after shelter
  - failSigs: {"explore:hazard":4,"explore:not_found":3,"explore:no_floor":1,"dig_down:attacked":1,"go_up:not_reached":1}
  - last decisions:
      29.1m eat y-59 hp15.000000953674316 f17 FAIL:dig_down:attacked
      29.1m eat y-59 hp15.000000953674316 f17 FAIL:dig_down:attacked
      29.1m explore y-59 hp15.000000953674316 f20 FAIL:dig_down:attacked
      30.5m explore y-59 hp17.53333282470703 f17 FAIL:explore:hazard
      30.5m go_up y-59 hp17.53333282470703 f17 FAIL:explore:hazard
      30.7m explore y-55 hp17.53333282470703 f17 FAIL:explore:hazard
      30.9m go_up y-55 hp17.53333282470703 f17 FAIL:explore:hazard
      33.3m shelter y53 hp17.53333282470703 f15 FAIL:go_up:not_reached
```
```
slot 341 [watchdog=0] timeout, deposited 0, deaths 2, 60.5 min, stage "6 diamond mined"
  - wood: min 0.2, y 125, pos -10239,125,-12288
  - cobble3: min 2.4, y 103, pos -10261,103,-12282
  - wooden_pick: min 1.1, y 121, pos -10248,121,-12287
  - stone_pick: min 2.5, y 103, pos -10261,103,-12282
  - iron_pick: min 9, y -1, pos -10272,-1,-12296
  - below_y0: min 8.7, y -1, pos -10272,-1,-12297
  - diamond_depth: min 10.5, y -59, pos -10269,-59,-12296
  - first_diamond: min 14.7, y -59, pos -10266,-59,-12304
  - start -10240,124,-12288, end -10111,-59,-12307, travelled 1030 blocks (max 130 from spawn)
  - time by skill: explore 15.7m, dig_down 13.3m, shelter 10.8m, mine 6.9m, go_up 5.9m
  - deaths: 26.7m y124 after shelter; 35.4m y125 after go_up
  - failSigs: {"mine:reach_failed":3,"go_up:attacked":1,"explore:attacked":1,"eat:error":1,"hunt:not_killed":1,"explore:no_tool":1,"explore:not_found":8,"dig_down:attacked":1,"explore:timeout":2}
  - last decisions:
      56.2m explore y-59 hp20 f19 FAIL:explore:not_found
      57.9m explore y-59 hp20 f19 FAIL:explore:not_found
      58m explore y-59 hp20 f19 FAIL:explore:not_found
      59.1m craft y-59 hp20 f19 FAIL:explore:timeout
      59.1m craft y-59 hp20 f19 FAIL:explore:timeout
      59.1m craft y-59 hp20 f19 FAIL:explore:timeout
      59.2m explore y-59 hp20 f19 FAIL:explore:timeout
      59.4m explore y-59 hp20 f19 FAIL:explore:not_found
```
```
slot 433 [veinScan=0] deaths, deposited 0, deaths 3, 29.4 min, stage "3 stone pickaxe"
  - wood: min 0.2, y 72, pos 9216,72,14346
  - cobble3: min 1.6, y 64, pos 9209,64,14334
  - wooden_pick: min 1.4, y 68, pos 9206,68,14334
  - stone_pick: min 1.7, y 64, pos 9209,64,14334
  - start 9216,71,14336, end 9236,22,14337, travelled 450 blocks (max 46 from spawn)
  - time by skill: shelter 9.9m, dig_down 9.8m, mine 4.7m, craft 1.7m, go_up 1.4m
  - deaths: 4.3m y71 after dig_down; 21.9m y71 after flee
  - failSigs: {"mine:dig_timeout":2,"mine:reach_failed":2,"dig_down:blocked":1,"explore:hazard":1,"shelter:hostile_waiting":3,"craft:attacked":1,"shelter:not_sealed":2}
  - last decisions:
      29.1m craft y22 hp13.184782981872559 f17 FAIL:shelter:hostile_waiting
      29.1m craft y22 hp13.184782981872559 f17 FAIL:shelter:hostile_waiting
      29.1m craft y22 hp10.184782981872559 f17 FAIL:craft:attacked
      29.2m craft y22 hp10.184782981872559 f17 FAIL:craft:attacked
      29.2m craft y22 hp10.184782981872559 f17 FAIL:craft:attacked
      29.2m shelter y22 hp7.684782981872559 f17 FAIL:craft:attacked
      29.2m shelter y22 hp7.684782981872559 f17 FAIL:shelter:not_sealed
      29.2m flee y22 hp7.684782981872559 f17 FAIL:shelter:not_sealed
```
```
slot 513 [watchdog=5] stuck, deposited 0, deaths 1, 42.2 min, stage "6 diamond mined"
  - wood: min 0.2, y 64, pos -13317,64,15362
  - cobble3: min 1.3, y 61, pos -13309,61,15350
  - wooden_pick: min 1, y 64, pos -13314,64,15352
  - stone_pick: min 1.4, y 61, pos -13309,61,15350
  - iron_pick: min 4.4, y 19, pos -13302,19,15355
  - below_y0: min 10.3, y -10, pos -13295,-10,15325
  - diamond_depth: min 28.1, y -58, pos -13284,-58,15390
  - first_diamond: min 28.1, y -58, pos -13284,-58,15390
  - three_diamonds: min 28.1, y -58, pos -13284,-58,15390
  - start -13312,64,15360, end -13281,19,15386, travelled 494 blocks (max 58 from spawn)
  - time by skill: shelter 12.9m, dig_down 11.4m, explore 5.5m, go_up 5.5m, mine 3.0m
  - deaths: 10.6m y64 after shelter
  - failSigs: {"mine:reach_failed":1,"dig_down:no_tool":2,"shelter:hostile_waiting":1,"dig_down:blocked":3,"explore:hazard":5,"go_up:no_progress":3,"explore:not_found":5,"go_up:not_reached":5}
  - last decisions:
      35.9m shelter y-58 hp20 f15 FAIL:explore:not_found
      38.4m shelter y-58 hp20 f15 FAIL:explore:not_found
      39.4m go_up y-58 hp20 f15 FAIL:explore:not_found
      41.2m go_up y19 hp20 f14 FAIL:go_up:not_reached
      41.4m go_up y19 hp20 f14 FAIL:go_up:not_reached
      41.6m go_up y19 hp20 f14 FAIL:go_up:not_reached
      41.9m go_up y19 hp20 f14 FAIL:go_up:not_reached
      42.1m go_up y19 hp20 f14 FAIL:go_up:not_reached
```
