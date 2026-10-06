# Combat baseline (existing shelter/fight skills)

SEAL ticks = ticks to first sealed state (else whole skill). Seal win = sealed at some tick and not dead. Fight win = ok, zombie dead or despawned, not dead.
hp via /damage

| scenario | n | win/seal | start hp | mean hp lost | mean ticks | deaths | reasons | held |
|---|---|---|---|---|---|---|---|---|
| SEAL-ADJ (20hp, zombie 1 away) | 10 | 0/10 | 20.0 | 4.7 | 118.6 | 0 | not_sealedx10 | cobblestonex10 |
| SEAL-ADJ-LOW (8hp, zombie 1 away) | 10 | 0/10 | 8.0 | 8.0 | 147.4 | 10 | not_sealed+diedx10 | handsx10 |
| SEAL-FAR (20hp, zombie 8 away) | 10 | 8/10 | 20.0 | 1.1 | 99.3 | 0 | not_sealedx2 okx8 | cobblestonex2 iron_pickaxex8 |
| TUNNEL-CLOSED (20hp, zombie 1 away) | 10 | 0/10 | 19.8 | 3.6 | 86.2 | 0 | not_sealedx10 | cobblestonex10 |
| TUNNEL-CLOSED (20hp, zombie 3 away) | 10 | 10/10 | 20.0 | 0.0 | 65.8 | 0 | okx10 | iron_pickaxex10 |
| TUNNEL-CLOSED (20hp, zombie 8 away) | 10 | 10/10 | 20.0 | 0.0 | 65.4 | 0 | okx10 | iron_pickaxex10 |
| TUNNEL-CLOSED (8hp, zombie 1 away) | 10 | 0/10 | 8.0 | 8.0 | 134.2 | 9 | not_sealed+diedx9 not_sealedx1 | handsx10 |
| TUNNEL-CLOSED (8hp, zombie 3 away) | 10 | 10/10 | 8.0 | 0.0 | 67.1 | 0 | okx10 | iron_pickaxex10 |
| TUNNEL-CLOSED (8hp, zombie 8 away) | 10 | 10/10 | 8.0 | 0.0 | 65.6 | 0 | okx10 | iron_pickaxex10 |
| TUNNEL-OPEN-BOTH (20hp, zombie 1 away) | 10 | 0/10 | 19.8 | 3.6 | 85.9 | 0 | not_sealedx10 | cobblestonex10 |
| TUNNEL-OPEN-BOTH (20hp, zombie 3 away) | 10 | 10/10 | 20.0 | 0.0 | 66.1 | 0 | okx10 | iron_pickaxex10 |
| TUNNEL-OPEN-BOTH (20hp, zombie 8 away) | 10 | 10/10 | 20.0 | 0.0 | 65.7 | 0 | okx10 | iron_pickaxex10 |
| TUNNEL-OPEN-BOTH (8hp, zombie 1 away) | 10 | 0/10 | 8.0 | 7.9 | 127.9 | 8 | not_sealedx2 not_sealed+diedx8 | handsx10 |
| TUNNEL-OPEN-BOTH (8hp, zombie 3 away) | 10 | 10/10 | 8.0 | 0.0 | 66.5 | 0 | okx10 | iron_pickaxex10 |
| TUNNEL-OPEN-BOTH (8hp, zombie 8 away) | 10 | 10/10 | 8.0 | 0.0 | 65.5 | 0 | okx10 | iron_pickaxex10 |
| FIGHT-1 iron_pickaxe | 10 | 0/10 | 20.0 | 0.0 | 40.6 | 0 | ok_but_zombie_alivex10 | handsx6 rotten_fleshx4 |
| FIGHT-1 stone_sword | 10 | 1/10 | 20.0 | 0.0 | 37.6 | 0 | ok_but_zombie_alivex9 okx1 | stone_swordx10 |
| FIGHT-1 iron_sword | 10 | 5/10 | 20.0 | 0.0 | 54.8 | 0 | ok_but_zombie_alivex5 okx5 | iron_swordx10 |

## Failure diagnosis (shelter runs)

Cause per unsealed run: a_slow = no placement failed (too slow, or a cell never attempted); b_entity = a failed placement had an entity overlapping the target cell; c_equip = equip error or missing item; d_error = another placement error. Once sealed the zombie is killed to skip the 30 s wait, so hp lost is up to the seal. Adjacent = zombie within 1.6 blocks of the bot.

| scenario | sealed | a_slow | b_entity | c_equip | d_error | mean adjacent tick | never adjacent | mean placeBlock calls |
|---|---|---|---|---|---|---|---|---|
| SEAL-ADJ (20hp, zombie 1 away) | 0 | 0 | 10 | 0 | 0 | 0.0 | 0 | 10.1 | 0 |
| SEAL-ADJ-LOW (8hp, zombie 1 away) | 0 | 0 | 10 | 0 | 0 | 0.0 | 0 | 7.4 | 0 |
| SEAL-FAR (20hp, zombie 8 away) | 8 | 0 | 2 | 0 | 0 | 73.9 | 1 | 10.1 | 6 |
| TUNNEL-CLOSED (20hp, zombie 1 away) | 0 | 0 | 10 | 0 | 0 | 0.0 | 0 | 6.0 | 1 |
| TUNNEL-CLOSED (20hp, zombie 3 away) | 10 | 0 | 0 | 0 | 0 | - | 10 | 4.0 | 8 |
| TUNNEL-CLOSED (20hp, zombie 8 away) | 10 | 0 | 0 | 0 | 0 | - | 10 | 4.0 | 10 |
| TUNNEL-CLOSED (8hp, zombie 1 away) | 0 | 0 | 10 | 0 | 0 | 0.0 | 0 | 5.2 | 0 |
| TUNNEL-CLOSED (8hp, zombie 3 away) | 10 | 0 | 0 | 0 | 0 | - | 10 | 4.0 | 0 |
| TUNNEL-CLOSED (8hp, zombie 8 away) | 10 | 0 | 0 | 0 | 0 | - | 10 | 4.0 | 0 |
| TUNNEL-OPEN-BOTH (20hp, zombie 1 away) | 0 | 0 | 10 | 0 | 0 | 0.0 | 0 | 6.0 | 1 |
| TUNNEL-OPEN-BOTH (20hp, zombie 3 away) | 10 | 0 | 0 | 0 | 0 | - | 10 | 4.0 | 8 |
| TUNNEL-OPEN-BOTH (20hp, zombie 8 away) | 10 | 0 | 0 | 0 | 0 | - | 10 | 4.0 | 6 |
| TUNNEL-OPEN-BOTH (8hp, zombie 1 away) | 0 | 0 | 10 | 0 | 0 | 0.0 | 0 | 5.2 | 0 |
| TUNNEL-OPEN-BOTH (8hp, zombie 3 away) | 10 | 0 | 0 | 0 | 0 | - | 10 | 4.0 | 0 |
| TUNNEL-OPEN-BOTH (8hp, zombie 8 away) | 10 | 0 | 0 | 0 | 0 | - | 10 | 4.0 | 0 |

### SEAL-FAR (20hp, zombie 8 away)
- #1 b_entity sealed@- end@121 adj@0 stale=0 placeCalls ok/fail=8/2 first@0 pre=[] open=[E0,E1] solidAt={"S0":23,"W0":34,"N0":45,"S1":66,"W1":77,"N1":88,"R":110} zdist/5t=[0,0,0,0,0,0,0,0,0,0,0,0] errs=E0(zombie):Server refused to place cobblestone at (217, -60, 216): the block is s
- #2 sealed sealed@107 end@146 adj@- stale=0 placeCalls ok/fail=10/0 first@0 pre=[] open=[E0,E1] solidAt={"E0":14,"S0":25,"W0":36,"N0":47,"E1":58,"S1":70,"W1":82,"N1":93,"R":106} zdist/5t=[8,8,8,8,9,9,8,8,7,7,6,5] errs=-
- #3 sealed sealed@94 end@133 adj@85 stale=7 placeCalls ok/fail=10/0 first@0 pre=[] open=[E0,E1] solidAt={"E0":2,"S0":13,"W0":24,"N0":35,"E1":46,"S1":57,"W1":69,"N1":80,"R":93} zdist/5t=[8,8,8,8,8,8,7,7,6,6,5,4] errs=-
- #4 sealed sealed@93 end@133 adj@84 stale=7 placeCalls ok/fail=10/0 first@0 pre=[] open=[E0,E1] solidAt={"E0":2,"S0":13,"W0":25,"N0":36,"E1":47,"S1":58,"W1":69,"N1":80,"R":92} zdist/5t=[8,8,8,8,8,8,7,6,6,5,5,4] errs=-
- #5 sealed sealed@92 end@134 adj@83 stale=7 placeCalls ok/fail=10/0 first@0 pre=[] open=[E0,E1] solidAt={"E0":1,"S0":12,"W0":23,"N0":34,"E1":45,"S1":57,"W1":68,"N1":79,"R":91} zdist/5t=[8,8,8,8,8,8,7,6,6,5,5,4] errs=-
- #6 sealed sealed@93 end@135 adj@85 stale=0 placeCalls ok/fail=10/0 first@0 pre=[] open=[E0,E1] solidAt={"E0":1,"S0":12,"W0":23,"N0":35,"E1":46,"S1":57,"W1":69,"N1":80,"R":92} zdist/5t=[8,8,8,8,8,8,7,7,6,5,5,4] errs=-
- #7 b_entity sealed@- end@103 adj@68 stale=7 placeCalls ok/fail=9/2 first@0 pre=[] open=[N1] solidAt={"E0":1,"S0":12,"W0":23,"N0":35,"E1":46,"S1":57,"W1":68,"R":91} zdist/5t=[8,8,8,7,7,6,6,5,5,4,4,3] errs=N1:Server refused to place cobblestone at (216, -59, 215): the block is s | N1(zombie):Server refused to place cobblestone at (216, -59, 215): the block is s
- #8 sealed sealed@105 end@145 adj@91 stale=0 placeCalls ok/fail=10/0 first@0 pre=[] open=[E0,E1] solidAt={"E0":11,"S0":22,"W0":34,"N0":46,"E1":57,"S1":68,"W1":79,"N1":91,"R":104} zdist/5t=[8,8,8,8,8,8,7,7,6,6,5,4] errs=-
- #9 sealed sealed@92 end@131 adj@85 stale=7 placeCalls ok/fail=10/0 first@0 pre=[] open=[E0,E1] solidAt={"E0":1,"S0":12,"W0":23,"N0":34,"E1":46,"S1":57,"W1":68,"N1":79,"R":91} zdist/5t=[8,8,8,8,8,8,7,7,6,6,5,4] errs=-
- #10 sealed sealed@93 end@133 adj@84 stale=7 placeCalls ok/fail=10/0 first@0 pre=[] open=[E0,E1] solidAt={"E0":1,"S0":12,"W0":23,"N0":34,"E1":45,"S1":56,"W1":68,"N1":80,"R":92} zdist/5t=[8,8,8,8,8,8,7,7,6,6,5,4] errs=-

### TUNNEL-CLOSED (20hp, zombie 1 away)
- #1 b_entity sealed@- end@83 adj@0 stale=2 placeCalls ok/fail=2/4 first@0 pre=[S0,N0,S1,N1,R] open=[E0,E1] solidAt={"W0":22,"W1":58} zdist/5t=[1,1,1,1,1,1,0,0,0,0,1,1] errs=E0(zombie):Server refused to place cobblestone at (217, -60, 216): the block is s | E1(zombie):Server refused to place cobblestone at (217, -59, 216): the block is s
- #2 b_entity sealed@- end@86 adj@0 stale=0 placeCalls ok/fail=2/4 first@0 pre=[S0,N0,S1,N1,R] open=[E0,E1] solidAt={"W0":25,"W1":61} zdist/5t=[1,1,1,1,1,1,1,1,1,1,0,0] errs=E0(zombie):Server refused to place cobblestone at (217, -60, 216): the block is s | E1(zombie):Server refused to place cobblestone at (217, -59, 216): the block is s
- #3 b_entity sealed@- end@87 adj@0 stale=0 placeCalls ok/fail=2/4 first@0 pre=[S0,N0,S1,N1,R] open=[E0,E1] solidAt={"W0":25,"W1":62} zdist/5t=[1,1,1,1,1,1,0,1,0,1,0,0] errs=E0(zombie):Server refused to place cobblestone at (217, -60, 216): the block is s | E1(zombie):Server refused to place cobblestone at (217, -59, 216): the block is s
- #4 b_entity sealed@- end@87 adj@0 stale=0 placeCalls ok/fail=2/4 first@0 pre=[S0,N0,S1,N1,R] open=[E0,E1] solidAt={"W0":26,"W1":62} zdist/5t=[1,1,1,1,1,1,1,0,0,1,1,1] errs=E0(zombie):Server refused to place cobblestone at (217, -60, 216): the block is s | E1(zombie):Server refused to place cobblestone at (217, -59, 216): the block is s
- #5 b_entity sealed@- end@87 adj@0 stale=0 placeCalls ok/fail=2/4 first@0 pre=[S0,N0,S1,N1,R] open=[E0,E1] solidAt={"W0":25,"W1":61} zdist/5t=[1,1,1,1,1,1,0,0,0,1,0,1] errs=E0(zombie):Server refused to place cobblestone at (217, -60, 216): the block is s | E1(zombie):Server refused to place cobblestone at (217, -59, 216): the block is s
- #6 b_entity sealed@- end@87 adj@0 stale=0 placeCalls ok/fail=2/4 first@0 pre=[S0,N0,S1,N1,R] open=[E0,E1] solidAt={"W0":26,"W1":62} zdist/5t=[1,1,1,2,2,2,1,1,0,0,0,1] errs=E0(zombie):Server refused to place cobblestone at (217, -60, 216): the block is s | E1:Server refused to place cobblestone at (217, -59, 216): the block is s | E1(zombie):Server refused to place cobblestone at (217, -59, 216): the block is s
- #7 b_entity sealed@- end@86 adj@0 stale=0 placeCalls ok/fail=2/4 first@0 pre=[S0,N0,S1,N1,R] open=[E0,E1] solidAt={"W0":25,"W1":61} zdist/5t=[1,1,1,1,1,1,0,1,0,1,0,1] errs=E0(zombie):Server refused to place cobblestone at (217, -60, 216): the block is s | E1(zombie):Server refused to place cobblestone at (217, -59, 216): the block is s
- #8 b_entity sealed@- end@87 adj@0 stale=0 placeCalls ok/fail=2/4 first@0 pre=[S0,N0,S1,N1,R] open=[E0,E1] solidAt={"W0":26,"W1":62} zdist/5t=[1,1,1,1,1,1,0,0,0,0,1,0] errs=E0(zombie):Server refused to place cobblestone at (217, -60, 216): the block is s | E1(zombie):Server refused to place cobblestone at (217, -59, 216): the block is s
- #9 b_entity sealed@- end@86 adj@0 stale=0 placeCalls ok/fail=2/4 first@0 pre=[S0,N0,S1,N1,R] open=[E0,E1] solidAt={"W0":25,"W1":61} zdist/5t=[1,1,1,1,1,1,0,0,0,1,0,0] errs=E0(zombie):Server refused to place cobblestone at (217, -60, 216): the block is s | E1(zombie):Server refused to place cobblestone at (217, -59, 216): the block is s
- #10 b_entity sealed@- end@86 adj@0 stale=0 placeCalls ok/fail=2/4 first@0 pre=[S0,N0,S1,N1,R] open=[E0,E1] solidAt={"W0":25,"W1":61} zdist/5t=[1,1,1,1,0,0,1,1,1,1,0,0] errs=E0(zombie):Server refused to place cobblestone at (217, -60, 216): the block is s | E1(zombie):Server refused to place cobblestone at (217, -59, 216): the block is s

### TUNNEL-CLOSED (20hp, zombie 3 away)
- #1 sealed sealed@68 end@109 adj@- stale=0 placeCalls ok/fail=4/0 first@0 pre=[S0,N0,S1,N1,R] open=[E0,E1] solidAt={"E0":4,"W0":25,"E1":46,"W1":67} zdist/5t=[3,3,3,3,3,3,2,2,2,2,2,2] errs=-
- #2 sealed sealed@65 end@104 adj@- stale=0 placeCalls ok/fail=4/0 first@0 pre=[S0,N0,S1,N1,R] open=[E0,E1] solidAt={"E0":1,"W0":22,"E1":43,"W1":64} zdist/5t=[3,3,3,3,3,3,2,2,2,2,2,2] errs=-
- #3 sealed sealed@66 end@106 adj@- stale=4 placeCalls ok/fail=4/0 first@0 pre=[S0,N0,S1,N1,R] open=[E0,E1] solidAt={"E0":1,"W0":22,"E1":43,"W1":65} zdist/5t=[3,3,3,3,3,3,2,2,2,2,2,2] errs=-
- #4 sealed sealed@65 end@106 adj@- stale=5 placeCalls ok/fail=4/0 first@0 pre=[S0,N0,S1,N1,R] open=[E0,E1] solidAt={"E0":1,"W0":22,"E1":43,"W1":64} zdist/5t=[3,3,3,3,3,3,2,2,2,2,2,2] errs=-
- #5 sealed sealed@66 end@106 adj@- stale=2 placeCalls ok/fail=4/0 first@0 pre=[S0,N0,S1,N1,R] open=[E0,E1] solidAt={"E0":1,"W0":23,"E1":44,"W1":65} zdist/5t=[3,3,3,3,2,2,2,2,2,2,2,2] errs=-
- #6 sealed sealed@65 end@105 adj@- stale=5 placeCalls ok/fail=4/0 first@0 pre=[S0,N0,S1,N1,R] open=[E0,E1] solidAt={"E0":1,"W0":22,"E1":43,"W1":64} zdist/5t=[3,3,3,3,3,3,2,2,2,2,2,2] errs=-
- #7 sealed sealed@66 end@106 adj@- stale=2 placeCalls ok/fail=4/0 first@0 pre=[S0,N0,S1,N1,R] open=[E0,E1] solidAt={"E0":1,"W0":23,"E1":44,"W1":65} zdist/5t=[3,3,3,3,3,3,3,3,3,3,2,2] errs=-
- #8 sealed sealed@65 end@106 adj@- stale=2 placeCalls ok/fail=4/0 first@0 pre=[S0,N0,S1,N1,R] open=[E0,E1] solidAt={"E0":1,"W0":22,"E1":43,"W1":64} zdist/5t=[3,3,3,3,3,3,2,2,2,2,2,2] errs=-
- #9 sealed sealed@65 end@105 adj@- stale=2 placeCalls ok/fail=4/0 first@0 pre=[S0,N0,S1,N1,R] open=[E0,E1] solidAt={"E0":1,"W0":22,"E1":43,"W1":64} zdist/5t=[3,3,3,3,3,3,2,2,2,2,2,2] errs=-
- #10 sealed sealed@67 end@108 adj@- stale=2 placeCalls ok/fail=4/0 first@0 pre=[S0,N0,S1,N1,R] open=[E0,E1] solidAt={"E0":2,"W0":23,"E1":44,"W1":66} zdist/5t=[3,3,3,3,3,3,2,2,2,2,2,2] errs=-

### TUNNEL-CLOSED (20hp, zombie 8 away)
- #1 sealed sealed@66 end@108 adj@- stale=2 placeCalls ok/fail=4/0 first@0 pre=[S0,N0,S1,N1,R] open=[E0,E1] solidAt={"E0":1,"W0":23,"E1":44,"W1":65} zdist/5t=[8,8,8,7,7,6,6,5,5,4,4,3] errs=-
- #2 sealed sealed@66 end@107 adj@- stale=2 placeCalls ok/fail=4/0 first@0 pre=[S0,N0,S1,N1,R] open=[E0,E1] solidAt={"E0":1,"W0":22,"E1":44,"W1":65} zdist/5t=[8,8,8,8,8,8,7,7,6,6,5,4] errs=-
- #3 sealed sealed@65 end@106 adj@- stale=5 placeCalls ok/fail=4/0 first@0 pre=[S0,N0,S1,N1,R] open=[E0,E1] solidAt={"E0":1,"W0":22,"E1":43,"W1":64} zdist/5t=[8,8,8,8,7,7,6,6,5,4,4,3] errs=-
- #4 sealed sealed@66 end@106 adj@- stale=2 placeCalls ok/fail=4/0 first@0 pre=[S0,N0,S1,N1,R] open=[E0,E1] solidAt={"E0":1,"W0":23,"E1":44,"W1":65} zdist/5t=[8,8,8,8,8,8,7,7,6,6,5,4] errs=-
- #5 sealed sealed@65 end@105 adj@- stale=2 placeCalls ok/fail=4/0 first@0 pre=[S0,N0,S1,N1,R] open=[E0,E1] solidAt={"E0":1,"W0":22,"E1":43,"W1":64} zdist/5t=[8,8,8,8,8,8,7,6,6,5,5,4] errs=-
- #6 sealed sealed@65 end@105 adj@- stale=2 placeCalls ok/fail=4/0 first@0 pre=[S0,N0,S1,N1,R] open=[E0,E1] solidAt={"E0":1,"W0":22,"E1":43,"W1":64} zdist/5t=[8,8,8,8,8,8,7,7,6,5,5,4] errs=-
- #7 sealed sealed@65 end@104 adj@- stale=5 placeCalls ok/fail=4/0 first@0 pre=[S0,N0,S1,N1,R] open=[E0,E1] solidAt={"E0":1,"W0":22,"E1":43,"W1":64} zdist/5t=[8,8,8,8,8,8,7,6,6,5,5,4] errs=-
- #8 sealed sealed@66 end@108 adj@- stale=2 placeCalls ok/fail=4/0 first@0 pre=[S0,N0,S1,N1,R] open=[E0,E1] solidAt={"E0":1,"W0":23,"E1":44,"W1":65} zdist/5t=[8,8,8,8,8,8,8,8,8,8,7,7] errs=-
- #9 sealed sealed@65 end@106 adj@- stale=2 placeCalls ok/fail=4/0 first@0 pre=[S0,N0,S1,N1,R] open=[E0,E1] solidAt={"E0":1,"W0":22,"E1":43,"W1":64} zdist/5t=[8,8,8,8,8,8,7,7,6,5,5,4] errs=-
- #10 sealed sealed@65 end@105 adj@- stale=5 placeCalls ok/fail=4/0 first@0 pre=[S0,N0,S1,N1,R] open=[E0,E1] solidAt={"E0":1,"W0":22,"E1":43,"W1":64} zdist/5t=[8,8,8,8,8,8,7,7,6,5,5,4] errs=-

### TUNNEL-CLOSED (8hp, zombie 1 away)
- #1 b_entity sealed@- end@146 adj@0 stale=0 placeCalls ok/fail=2/4 first@0 pre=[S0,N0,S1,N1,R] open=[E0,S0,W0,N0,E1,S1,W1,N1,R] solidAt={"W0":22,"W1":58} zdist/5t=[1,1,1,0,0,0,1,1,1,0,0,0] errs=E0(zombie):Server refused to place cobblestone at (217, -60, 216): the block is s | E1(zombie):Server refused to place cobblestone at (217, -59, 216): the block is s | E1(zombie):Server did not answer the placement at (217, -59, 216): Event blockUpd
- #2 b_entity sealed@- end@138 adj@0 stale=0 placeCalls ok/fail=2/3 first@0 pre=[S0,N0,S1,N1,R] open=[E0,S0,W0,N0,E1,S1,W1,N1,R] solidAt={"W0":33,"W1":69} zdist/5t=[1,1,1,1,1,1,0,0,0,1,1,0] errs=E0(zombie):Server refused to place cobblestone at (217, -60, 216): the block is s | E1(zombie):Server refused to place cobblestone at (217, -59, 216): the block is s | E0(zombie):Server did not answer the placement at (217, -60, 216): Event blockUpd
- #3 b_entity sealed@- end@136 adj@0 stale=0 placeCalls ok/fail=2/3 first@0 pre=[S0,N0,S1,N1,R] open=[E0,S0,W0,N0,E1,S1,W1,N1,R] solidAt={"W0":32,"W1":68} zdist/5t=[1,1,1,1,1,1,0,1,0,1,0,0] errs=E0(zombie):Server refused to place cobblestone at (217, -60, 216): the block is s | E1(zombie):Server refused to place cobblestone at (217, -59, 216): the block is s | E0(zombie):Server did not answer the placement at (217, -60, 216): Event blockUpd
- #4 b_entity sealed@- end@136 adj@0 stale=0 placeCalls ok/fail=2/3 first@0 pre=[S0,N0,S1,N1,R] open=[E0,S0,W0,N0,E1,S1,W1,N1,R] solidAt={"W0":32,"W1":68} zdist/5t=[1,1,0,0,0,0,1,1,1,0,0,0] errs=E0(zombie):Server refused to place cobblestone at (217, -60, 216): the block is s | E1(zombie):Server refused to place cobblestone at (217, -59, 216): the block is s | E0(zombie):Server did not answer the placement at (217, -60, 216): Event blockUpd
- #5 b_entity sealed@- end@139 adj@0 stale=0 placeCalls ok/fail=2/3 first@0 pre=[S0,N0,S1,N1,R] open=[E0,S0,W0,N0,E1,S1,W1,N1,R] solidAt={"W0":33,"W1":70} zdist/5t=[1,1,1,1,1,1,0,1,0,1,0,1] errs=E0(zombie):Server refused to place cobblestone at (217, -60, 216): the block is s | E1(zombie):Server refused to place cobblestone at (217, -59, 216): the block is s | E0(zombie):Server did not answer the placement at (217, -60, 216): Event blockUpd
- #6 b_entity sealed@- end@139 adj@0 stale=0 placeCalls ok/fail=2/3 first@0 pre=[S0,N0,S1,N1,R] open=[E0,S0,W0,N0,E1,S1,W1,N1,R] solidAt={"W0":34,"W1":71} zdist/5t=[1,1,1,1,1,1,1,1,1,0,1,0] errs=E0(zombie):Server refused to place cobblestone at (217, -60, 216): the block is s | E1(zombie):Server refused to place cobblestone at (217, -59, 216): the block is s | E0(zombie):Server did not answer the placement at (217, -60, 216): Event blockUpd
- #7 b_entity sealed@- end@95 adj@0 stale=0 placeCalls ok/fail=2/4 first@0 pre=[S0,N0,S1,N1,R] open=[E0,E1] solidAt={"W0":33,"W1":70} zdist/5t=[1,1,1,1,1,1,1,1,1,1,0,0] errs=E0(zombie):Server refused to place cobblestone at (217, -60, 216): the block is s | E1(zombie):Server refused to place cobblestone at (217, -59, 216): the block is s
- #8 b_entity sealed@- end@138 adj@0 stale=0 placeCalls ok/fail=2/3 first@0 pre=[S0,N0,S1,N1,R] open=[E0,S0,W0,N0,E1,S1,W1,N1,R] solidAt={"W0":33,"W1":69} zdist/5t=[1,1,1,1,1,1,0,1,0,1,0,0] errs=E0(zombie):Server refused to place cobblestone at (217, -60, 216): the block is s | E1(zombie):Server refused to place cobblestone at (217, -59, 216): the block is s | E0(zombie):Server did not answer the placement at (217, -60, 216): Event blockUpd
- #9 b_entity sealed@- end@138 adj@0 stale=0 placeCalls ok/fail=2/3 first@0 pre=[S0,N0,S1,N1,R] open=[E0,S0,W0,N0,E1,S1,W1,N1,R] solidAt={"W0":32,"W1":68} zdist/5t=[1,1,1,1,1,1,0,1,0,1,0,0] errs=E0(zombie):Server refused to place cobblestone at (217, -60, 216): the block is s | E1(zombie):Server refused to place cobblestone at (217, -59, 216): the block is s | E0(zombie):Server did not answer the placement at (217, -60, 216): Event blockUpd
- #10 b_entity sealed@- end@137 adj@0 stale=0 placeCalls ok/fail=2/3 first@0 pre=[S0,N0,S1,N1,R] open=[E0,S0,W0,N0,E1,S1,W1,N1,R] solidAt={"W0":32,"W1":68} zdist/5t=[1,1,1,1,1,1,1,0,0,1,1,0] errs=E0(zombie):Server refused to place cobblestone at (217, -60, 216): the block is s | E1(zombie):Server refused to place cobblestone at (217, -59, 216): the block is s | E0(zombie):Server did not answer the placement at (217, -60, 216): Event blockUpd

### TUNNEL-CLOSED (8hp, zombie 3 away)
- #1 sealed sealed@76 end@116 adj@- stale=0 placeCalls ok/fail=4/0 first@0 pre=[S0,N0,S1,N1,R] open=[E0,E1] solidAt={"E0":12,"W0":33,"E1":54,"W1":75} zdist/5t=[3,3,3,3,3,3,2,2,2,2,2,2] errs=-
- #2 sealed sealed@65 end@105 adj@- stale=0 placeCalls ok/fail=4/0 first@0 pre=[S0,N0,S1,N1,R] open=[E0,E1] solidAt={"E0":1,"W0":22,"E1":43,"W1":64} zdist/5t=[3,3,3,3,3,2,2,2,2,2,2,2] errs=-
- #3 sealed sealed@66 end@107 adj@- stale=0 placeCalls ok/fail=4/0 first@0 pre=[S0,N0,S1,N1,R] open=[E0,E1] solidAt={"E0":1,"W0":22,"E1":44,"W1":65} zdist/5t=[3,3,3,3,3,3,2,2,2,2,2,2] errs=-
- #4 sealed sealed@67 end@107 adj@- stale=0 placeCalls ok/fail=4/0 first@0 pre=[S0,N0,S1,N1,R] open=[E0,E1] solidAt={"E0":1,"W0":23,"E1":45,"W1":66} zdist/5t=[3,3,3,3,3,3,2,2,2,2,2,2] errs=-
- #5 sealed sealed@67 end@106 adj@- stale=0 placeCalls ok/fail=4/0 first@0 pre=[S0,N0,S1,N1,R] open=[E0,E1] solidAt={"E0":1,"W0":22,"E1":44,"W1":66} zdist/5t=[3,3,3,3,3,3,2,2,2,2,2,2] errs=-
- #6 sealed sealed@66 end@106 adj@- stale=0 placeCalls ok/fail=4/0 first@0 pre=[S0,N0,S1,N1,R] open=[E0,E1] solidAt={"E0":1,"W0":23,"E1":44,"W1":65} zdist/5t=[3,3,3,3,3,3,3,3,3,3,2,2] errs=-
- #7 sealed sealed@65 end@106 adj@- stale=0 placeCalls ok/fail=4/0 first@0 pre=[S0,N0,S1,N1,R] open=[E0,E1] solidAt={"E0":1,"W0":22,"E1":43,"W1":64} zdist/5t=[3,3,3,3,3,3,2,2,2,2,2,2] errs=-
- #8 sealed sealed@66 end@105 adj@- stale=0 placeCalls ok/fail=4/0 first@0 pre=[S0,N0,S1,N1,R] open=[E0,E1] solidAt={"E0":2,"W0":23,"E1":44,"W1":65} zdist/5t=[3,3,3,3,3,3,2,2,2,2,2,2] errs=-
- #9 sealed sealed@67 end@107 adj@- stale=0 placeCalls ok/fail=4/0 first@0 pre=[S0,N0,S1,N1,R] open=[E0,E1] solidAt={"E0":1,"W0":23,"E1":44,"W1":66} zdist/5t=[3,3,3,3,3,3,2,2,2,2,2,2] errs=-
- #10 sealed sealed@66 end@106 adj@- stale=0 placeCalls ok/fail=4/0 first@0 pre=[S0,N0,S1,N1,R] open=[E0,E1] solidAt={"E0":1,"W0":22,"E1":43,"W1":65} zdist/5t=[3,3,3,3,3,3,2,2,2,2,2,2] errs=-

### TUNNEL-CLOSED (8hp, zombie 8 away)
- #1 sealed sealed@67 end@107 adj@- stale=0 placeCalls ok/fail=4/0 first@0 pre=[S0,N0,S1,N1,R] open=[E0,E1] solidAt={"E0":2,"W0":23,"E1":45,"W1":66} zdist/5t=[8,8,8,8,8,8,7,6,6,5,5,4] errs=-
- #2 sealed sealed@66 end@106 adj@- stale=0 placeCalls ok/fail=4/0 first@0 pre=[S0,N0,S1,N1,R] open=[E0,E1] solidAt={"E0":2,"W0":23,"E1":44,"W1":65} zdist/5t=[8,8,8,8,8,8,8,8,8,8,7,7] errs=-
- #3 sealed sealed@66 end@106 adj@- stale=0 placeCalls ok/fail=4/0 first@0 pre=[S0,N0,S1,N1,R] open=[E0,E1] solidAt={"E0":2,"W0":23,"E1":44,"W1":65} zdist/5t=[8,8,8,9,9,10,9,9,8,8,7,6] errs=-
- #4 sealed sealed@66 end@107 adj@- stale=0 placeCalls ok/fail=4/0 first@0 pre=[S0,N0,S1,N1,R] open=[E0,E1] solidAt={"E0":2,"W0":23,"E1":44,"W1":65} zdist/5t=[8,8,8,8,8,8,7,7,6,5,5,4] errs=-
- #5 sealed sealed@65 end@105 adj@- stale=0 placeCalls ok/fail=4/0 first@0 pre=[S0,N0,S1,N1,R] open=[E0,E1] solidAt={"E0":1,"W0":22,"E1":43,"W1":64} zdist/5t=[8,8,8,8,8,8,7,6,6,5,5,4] errs=-
- #6 sealed sealed@65 end@104 adj@- stale=0 placeCalls ok/fail=4/0 first@0 pre=[S0,N0,S1,N1,R] open=[E0,E1] solidAt={"E0":1,"W0":22,"E1":43,"W1":64} zdist/5t=[8,8,8,8,8,8,7,6,6,5,5,4] errs=-
- #7 sealed sealed@66 end@108 adj@- stale=0 placeCalls ok/fail=4/0 first@0 pre=[S0,N0,S1,N1,R] open=[E0,E1] solidAt={"E0":1,"W0":22,"E1":44,"W1":65} zdist/5t=[8,8,8,8,8,8,7,7,6,5,5,4] errs=-
- #8 sealed sealed@65 end@108 adj@- stale=0 placeCalls ok/fail=4/0 first@0 pre=[S0,N0,S1,N1,R] open=[E0,E1] solidAt={"E0":1,"W0":22,"E1":43,"W1":64} zdist/5t=[8,8,8,8,8,8,7,7,6,6,5,4] errs=-
- #9 sealed sealed@65 end@106 adj@- stale=0 placeCalls ok/fail=4/0 first@0 pre=[S0,N0,S1,N1,R] open=[E0,E1] solidAt={"E0":1,"W0":22,"E1":43,"W1":64} zdist/5t=[8,8,8,8,8,8,7,6,6,5,5,4] errs=-
- #10 sealed sealed@65 end@106 adj@- stale=0 placeCalls ok/fail=4/0 first@0 pre=[S0,N0,S1,N1,R] open=[E0,E1] solidAt={"E0":1,"W0":22,"E1":43,"W1":64} zdist/5t=[8,8,8,8,8,8,7,6,6,5,5,4] errs=-

### TUNNEL-OPEN-BOTH (20hp, zombie 1 away)
- #1 b_entity sealed@- end@83 adj@0 stale=5 placeCalls ok/fail=2/4 first@0 pre=[S0,N0,S1,N1,R] open=[E0,E1] solidAt={"W0":22,"W1":58} zdist/5t=[1,1,1,1,1,1,0,0,0,0,1,0] errs=E0(zombie):Server refused to place cobblestone at (217, -60, 216): the block is s | E1(zombie):Server refused to place cobblestone at (217, -59, 216): the block is s
- #2 b_entity sealed@- end@87 adj@0 stale=0 placeCalls ok/fail=2/4 first@0 pre=[S0,N0,S1,N1,R] open=[E0,E1] solidAt={"W0":26,"W1":62} zdist/5t=[1,1,1,1,1,1,0,0,0,1,0,0] errs=E0(zombie):Server refused to place cobblestone at (217, -60, 216): the block is s | E1(zombie):Server refused to place cobblestone at (217, -59, 216): the block is s
- #3 b_entity sealed@- end@86 adj@0 stale=0 placeCalls ok/fail=2/4 first@0 pre=[S0,N0,S1,N1,R] open=[E0,E1] solidAt={"W0":25,"W1":61} zdist/5t=[1,1,1,1,1,1,0,1,0,1,0,0] errs=E0(zombie):Server refused to place cobblestone at (217, -60, 216): the block is s | E1(zombie):Server refused to place cobblestone at (217, -59, 216): the block is s
- #4 b_entity sealed@- end@86 adj@0 stale=0 placeCalls ok/fail=2/4 first@0 pre=[S0,N0,S1,N1,R] open=[E0,E1] solidAt={"W0":25,"W1":61} zdist/5t=[1,1,1,1,1,0,0,0,0,1,0,1] errs=E0(zombie):Server refused to place cobblestone at (217, -60, 216): the block is s | E1(zombie):Server refused to place cobblestone at (217, -59, 216): the block is s
- #5 b_entity sealed@- end@86 adj@0 stale=0 placeCalls ok/fail=2/4 first@0 pre=[S0,N0,S1,N1,R] open=[E0,E1] solidAt={"W0":25,"W1":61} zdist/5t=[1,1,1,1,1,1,1,1,1,0,0,0] errs=E0(zombie):Server refused to place cobblestone at (217, -60, 216): the block is s | E1(zombie):Server refused to place cobblestone at (217, -59, 216): the block is s
- #6 b_entity sealed@- end@87 adj@0 stale=0 placeCalls ok/fail=2/4 first@0 pre=[S0,N0,S1,N1,R] open=[E0,E1] solidAt={"W0":25,"W1":62} zdist/5t=[1,1,1,1,1,1,0,1,1,0,0,0] errs=E0(zombie):Server refused to place cobblestone at (217, -60, 216): the block is s | E1(zombie):Server refused to place cobblestone at (217, -59, 216): the block is s
- #7 b_entity sealed@- end@86 adj@0 stale=0 placeCalls ok/fail=2/4 first@0 pre=[S0,N0,S1,N1,R] open=[E0,E1] solidAt={"W0":25,"W1":61} zdist/5t=[1,1,1,1,1,1,0,0,0,1,0,0] errs=E0(zombie):Server refused to place cobblestone at (217, -60, 216): the block is s | E1(zombie):Server refused to place cobblestone at (217, -59, 216): the block is s
- #8 b_entity sealed@- end@86 adj@0 stale=0 placeCalls ok/fail=2/4 first@0 pre=[S0,N0,S1,N1,R] open=[E0,E1] solidAt={"W0":25,"W1":61} zdist/5t=[1,1,1,1,1,1,0,0,0,1,0,0] errs=E0(zombie):Server refused to place cobblestone at (217, -60, 216): the block is s | E1(zombie):Server refused to place cobblestone at (217, -59, 216): the block is s
- #9 b_entity sealed@- end@86 adj@0 stale=0 placeCalls ok/fail=2/4 first@0 pre=[S0,N0,S1,N1,R] open=[E0,E1] solidAt={"W0":25,"W1":61} zdist/5t=[1,1,1,1,1,1,0,0,0,1,0,0] errs=E0(zombie):Server refused to place cobblestone at (217, -60, 216): the block is s | E1(zombie):Server refused to place cobblestone at (217, -59, 216): the block is s
- #10 b_entity sealed@- end@86 adj@0 stale=0 placeCalls ok/fail=2/4 first@0 pre=[S0,N0,S1,N1,R] open=[E0,E1] solidAt={"W0":25,"W1":61} zdist/5t=[1,1,1,1,1,1,0,0,0,0,0,0] errs=E0(zombie):Server refused to place cobblestone at (217, -60, 216): the block is s | E1(zombie):Server refused to place cobblestone at (217, -59, 216): the block is s

### TUNNEL-OPEN-BOTH (20hp, zombie 3 away)
- #1 sealed sealed@69 end@109 adj@- stale=0 placeCalls ok/fail=4/0 first@0 pre=[S0,N0,S1,N1,R] open=[E0,E1] solidAt={"E0":4,"W0":25,"E1":46,"W1":68} zdist/5t=[3,3,3,3,3,3,2,2,3,3,3,2] errs=-
- #2 sealed sealed@66 end@108 adj@- stale=2 placeCalls ok/fail=4/0 first@0 pre=[S0,N0,S1,N1,R] open=[E0,E1] solidAt={"E0":2,"W0":23,"E1":44,"W1":65} zdist/5t=[3,3,3,3,3,3,2,2,2,2,2,2] errs=-
- #3 sealed sealed@65 end@105 adj@- stale=2 placeCalls ok/fail=4/0 first@0 pre=[S0,N0,S1,N1,R] open=[E0,E1] solidAt={"E0":1,"W0":22,"E1":43,"W1":64} zdist/5t=[3,3,3,3,3,3,2,2,2,2,2,2] errs=-
- #4 sealed sealed@66 end@107 adj@- stale=0 placeCalls ok/fail=4/0 first@0 pre=[S0,N0,S1,N1,R] open=[E0,E1] solidAt={"E0":2,"W0":23,"E1":44,"W1":65} zdist/5t=[3,3,3,3,3,3,3,3,3,3,2,2] errs=-
- #5 sealed sealed@65 end@106 adj@- stale=2 placeCalls ok/fail=4/0 first@0 pre=[S0,N0,S1,N1,R] open=[E0,E1] solidAt={"E0":1,"W0":22,"E1":43,"W1":64} zdist/5t=[3,3,3,3,3,3,2,2,2,2,2,2] errs=-
- #6 sealed sealed@67 end@108 adj@- stale=2 placeCalls ok/fail=4/0 first@0 pre=[S0,N0,S1,N1,R] open=[E0,E1] solidAt={"E0":2,"W0":23,"E1":44,"W1":66} zdist/5t=[3,3,3,3,4,4,3,3,2,2,2,2] errs=-
- #7 sealed sealed@66 end@106 adj@- stale=5 placeCalls ok/fail=4/0 first@0 pre=[S0,N0,S1,N1,R] open=[E0,E1] solidAt={"E0":1,"W0":22,"E1":43,"W1":65} zdist/5t=[3,3,3,3,3,3,2,2,2,2,2,2] errs=-
- #8 sealed sealed@65 end@104 adj@- stale=2 placeCalls ok/fail=4/0 first@0 pre=[S0,N0,S1,N1,R] open=[E0,E1] solidAt={"E0":1,"W0":22,"E1":43,"W1":64} zdist/5t=[3,3,3,3,3,3,2,2,2,2,2,2] errs=-
- #9 sealed sealed@66 end@106 adj@- stale=2 placeCalls ok/fail=4/0 first@0 pre=[S0,N0,S1,N1,R] open=[E0,E1] solidAt={"E0":1,"W0":22,"E1":43,"W1":65} zdist/5t=[3,3,3,3,3,3,2,2,2,2,2,2] errs=-
- #10 sealed sealed@66 end@105 adj@- stale=2 placeCalls ok/fail=4/0 first@0 pre=[S0,N0,S1,N1,R] open=[E0,E1] solidAt={"E0":1,"W0":22,"E1":43,"W1":65} zdist/5t=[3,3,3,2,2,2,2,2,2,2,2,2] errs=-

### TUNNEL-OPEN-BOTH (20hp, zombie 8 away)
- #1 sealed sealed@66 end@108 adj@- stale=5 placeCalls ok/fail=4/0 first@0 pre=[S0,N0,S1,N1,R] open=[E0,E1] solidAt={"E0":2,"W0":23,"E1":44,"W1":65} zdist/5t=[8,8,8,9,9,10,9,9,8,8,7,6] errs=-
- #2 sealed sealed@66 end@105 adj@- stale=0 placeCalls ok/fail=4/0 first@0 pre=[S0,N0,S1,N1,R] open=[E0,E1] solidAt={"E0":1,"W0":22,"E1":43,"W1":65} zdist/5t=[8,8,8,8,8,8,7,7,6,5,5,4] errs=-
- #3 sealed sealed@65 end@105 adj@- stale=0 placeCalls ok/fail=4/0 first@0 pre=[S0,N0,S1,N1,R] open=[E0,E1] solidAt={"E0":1,"W0":22,"E1":43,"W1":64} zdist/5t=[8,8,8,8,8,8,7,7,6,5,5,4] errs=-
- #4 sealed sealed@65 end@105 adj@- stale=0 placeCalls ok/fail=4/0 first@0 pre=[S0,N0,S1,N1,R] open=[E0,E1] solidAt={"E0":1,"W0":22,"E1":43,"W1":64} zdist/5t=[8,8,8,8,8,8,7,7,6,6,5,4] errs=-
- #5 sealed sealed@65 end@104 adj@- stale=2 placeCalls ok/fail=4/0 first@0 pre=[S0,N0,S1,N1,R] open=[E0,E1] solidAt={"E0":1,"W0":22,"E1":43,"W1":64} zdist/5t=[8,8,8,8,8,8,7,7,6,5,5,4] errs=-
- #6 sealed sealed@66 end@108 adj@- stale=0 placeCalls ok/fail=4/0 first@0 pre=[S0,N0,S1,N1,R] open=[E0,E1] solidAt={"E0":1,"W0":22,"E1":44,"W1":65} zdist/5t=[8,8,8,8,8,8,7,6,6,5,5,4] errs=-
- #7 sealed sealed@67 end@107 adj@- stale=2 placeCalls ok/fail=4/0 first@0 pre=[S0,N0,S1,N1,R] open=[E0,E1] solidAt={"E0":2,"W0":23,"E1":44,"W1":66} zdist/5t=[8,8,8,8,8,8,7,7,6,5,5,4] errs=-
- #8 sealed sealed@66 end@107 adj@- stale=2 placeCalls ok/fail=4/0 first@0 pre=[S0,N0,S1,N1,R] open=[E0,E1] solidAt={"E0":1,"W0":22,"E1":44,"W1":65} zdist/5t=[8,8,8,8,8,8,7,6,6,5,5,4] errs=-
- #9 sealed sealed@66 end@105 adj@- stale=2 placeCalls ok/fail=4/0 first@0 pre=[S0,N0,S1,N1,R] open=[E0,E1] solidAt={"E0":1,"W0":22,"E1":43,"W1":65} zdist/5t=[8,8,8,8,8,8,7,7,6,5,5,4] errs=-
- #10 sealed sealed@65 end@107 adj@- stale=5 placeCalls ok/fail=4/0 first@0 pre=[S0,N0,S1,N1,R] open=[E0,E1] solidAt={"E0":1,"W0":22,"E1":43,"W1":64} zdist/5t=[8,8,8,8,8,8,7,7,6,5,5,4] errs=-

### TUNNEL-OPEN-BOTH (8hp, zombie 1 away)
- #1 b_entity sealed@- end@83 adj@0 stale=0 placeCalls ok/fail=2/4 first@0 pre=[S0,N0,S1,N1,R] open=[E0,E1] solidAt={"W0":22,"W1":58} zdist/5t=[1,1,1,1,1,1,0,0,0,1,1,0] errs=E0(zombie):Server refused to place cobblestone at (217, -60, 216): the block is s | E1(zombie):Server refused to place cobblestone at (217, -59, 216): the block is s
- #2 b_entity sealed@- end@136 adj@0 stale=0 placeCalls ok/fail=2/3 first@0 pre=[S0,N0,S1,N1,R] open=[E0,S0,W0,N0,E1,S1,W1,N1,R] solidAt={"W0":32,"W1":68} zdist/5t=[1,1,1,1,1,0,0,0,0,1,0,0] errs=E0(zombie):Server refused to place cobblestone at (217, -60, 216): the block is s | E1(zombie):Server refused to place cobblestone at (217, -59, 216): the block is s | E0(zombie):Server did not answer the placement at (217, -60, 216): Event blockUpd
- #3 b_entity sealed@- end@137 adj@0 stale=0 placeCalls ok/fail=2/3 first@0 pre=[S0,N0,S1,N1,R] open=[E0,S0,W0,N0,E1,S1,W1,N1,R] solidAt={"W0":32,"W1":68} zdist/5t=[1,1,1,1,1,1,1,1,1,0,0,0] errs=E0(zombie):Server refused to place cobblestone at (217, -60, 216): the block is s | E1(zombie):Server refused to place cobblestone at (217, -59, 216): the block is s | E0(zombie):Server did not answer the placement at (217, -60, 216): Event blockUpd
- #4 b_entity sealed@- end@137 adj@0 stale=0 placeCalls ok/fail=2/3 first@0 pre=[S0,N0,S1,N1,R] open=[E0,S0,W0,N0,E1,S1,W1,N1,R] solidAt={"W0":32,"W1":68} zdist/5t=[1,1,1,1,1,1,0,1,0,1,1,0] errs=E0(zombie):Server refused to place cobblestone at (217, -60, 216): the block is s | E1(zombie):Server refused to place cobblestone at (217, -59, 216): the block is s | E0(zombie):Server did not answer the placement at (217, -60, 216): Event blockUpd
- #5 b_entity sealed@- end@137 adj@0 stale=0 placeCalls ok/fail=2/3 first@0 pre=[S0,N0,S1,N1,R] open=[E0,S0,W0,N0,E1,S1,W1,N1,R] solidAt={"W0":33,"W1":69} zdist/5t=[1,1,1,1,1,1,0,1,0,0,0,0] errs=E0(zombie):Server refused to place cobblestone at (217, -60, 216): the block is s | E1(zombie):Server refused to place cobblestone at (217, -59, 216): the block is s | E0(zombie):Server did not answer the placement at (217, -60, 216): Event blockUpd
- #6 b_entity sealed@- end@139 adj@0 stale=0 placeCalls ok/fail=2/3 first@0 pre=[S0,N0,S1,N1,R] open=[E0,S0,W0,N0,E1,S1,W1,N1,R] solidAt={"W0":33,"W1":69} zdist/5t=[1,1,1,1,1,2,1,0,1,0,1,0] errs=E0(zombie):Server refused to place cobblestone at (217, -60, 216): the block is s | E1(zombie):Server refused to place cobblestone at (217, -59, 216): the block is s | E0(zombie):Server did not answer the placement at (217, -60, 216): Event blockUpd
- #7 b_entity sealed@- end@137 adj@0 stale=0 placeCalls ok/fail=2/3 first@0 pre=[S0,N0,S1,N1,R] open=[E0,S0,W0,N0,E1,S1,W1,N1,R] solidAt={"W0":32,"W1":68} zdist/5t=[1,1,1,1,1,1,0,1,1,0,0,0] errs=E0(zombie):Server refused to place cobblestone at (217, -60, 216): the block is s | E1(zombie):Server refused to place cobblestone at (217, -59, 216): the block is s | E0(zombie):Server did not answer the placement at (217, -60, 216): Event blockUpd
- #8 b_entity sealed@- end@94 adj@0 stale=0 placeCalls ok/fail=2/4 first@0 pre=[S0,N0,S1,N1,R] open=[E0,E1] solidAt={"W0":32,"W1":68} zdist/5t=[1,1,1,1,1,1,1,1,1,1,1,0] errs=E0(zombie):Server refused to place cobblestone at (217, -60, 216): the block is s | E1(zombie):Server refused to place cobblestone at (217, -59, 216): the block is s
- #9 b_entity sealed@- end@141 adj@0 stale=0 placeCalls ok/fail=2/3 first@0 pre=[S0,N0,S1,N1,R] open=[E0,S0,W0,N0,E1,S1,W1,N1,R] solidAt={"W0":33,"W1":71} zdist/5t=[1,1,1,1,0,0,1,1,1,1,0,0] errs=E0(zombie):Server refused to place cobblestone at (217, -60, 216): the block is s | E1(zombie):Server refused to place cobblestone at (217, -59, 216): the block is s | E0(zombie):Server did not answer the placement at (217, -60, 216): Event blockUpd
- #10 b_entity sealed@- end@138 adj@0 stale=0 placeCalls ok/fail=2/3 first@0 pre=[S0,N0,S1,N1,R] open=[E0,S0,W0,N0,E1,S1,W1,N1,R] solidAt={"W0":32,"W1":68} zdist/5t=[1,1,1,1,1,1,1,0,0,1,0,0] errs=E0(zombie):Server refused to place cobblestone at (217, -60, 216): the block is s | E1(zombie):Server refused to place cobblestone at (217, -59, 216): the block is s | E0(zombie):Server did not answer the placement at (217, -60, 216): Event blockUpd

### TUNNEL-OPEN-BOTH (8hp, zombie 3 away)
- #1 sealed sealed@77 end@118 adj@- stale=0 placeCalls ok/fail=4/0 first@0 pre=[S0,N0,S1,N1,R] open=[E0,E1] solidAt={"E0":12,"W0":34,"E1":55,"W1":76} zdist/5t=[3,3,3,3,3,3,2,2,2,2,2,2] errs=-
- #2 sealed sealed@67 end@108 adj@- stale=0 placeCalls ok/fail=4/0 first@0 pre=[S0,N0,S1,N1,R] open=[E0,E1] solidAt={"E0":1,"W0":23,"E1":45,"W1":66} zdist/5t=[3,3,3,3,3,3,2,2,2,2,2,2] errs=-
- #3 sealed sealed@65 end@105 adj@- stale=0 placeCalls ok/fail=4/0 first@0 pre=[S0,N0,S1,N1,R] open=[E0,E1] solidAt={"E0":1,"W0":22,"E1":43,"W1":64} zdist/5t=[3,3,3,3,3,3,2,2,2,2,2,2] errs=-
- #4 sealed sealed@65 end@105 adj@- stale=0 placeCalls ok/fail=4/0 first@0 pre=[S0,N0,S1,N1,R] open=[E0,E1] solidAt={"E0":1,"W0":22,"E1":43,"W1":64} zdist/5t=[3,3,3,3,3,3,2,2,2,2,2,2] errs=-
- #5 sealed sealed@66 end@107 adj@- stale=0 placeCalls ok/fail=4/0 first@0 pre=[S0,N0,S1,N1,R] open=[E0,E1] solidAt={"E0":1,"W0":22,"E1":44,"W1":65} zdist/5t=[3,3,3,3,4,4,3,3,2,2,2,2] errs=-
- #6 sealed sealed@65 end@106 adj@- stale=0 placeCalls ok/fail=4/0 first@0 pre=[S0,N0,S1,N1,R] open=[E0,E1] solidAt={"E0":1,"W0":22,"E1":43,"W1":64} zdist/5t=[3,3,3,3,3,3,2,2,2,2,2,2] errs=-
- #7 sealed sealed@65 end@108 adj@- stale=0 placeCalls ok/fail=4/0 first@0 pre=[S0,N0,S1,N1,R] open=[E0,E1] solidAt={"E0":1,"W0":22,"E1":43,"W1":64} zdist/5t=[3,3,3,3,3,3,2,2,2,2,2,2] errs=-
- #8 sealed sealed@65 end@105 adj@- stale=0 placeCalls ok/fail=4/0 first@0 pre=[S0,N0,S1,N1,R] open=[E0,E1] solidAt={"E0":1,"W0":22,"E1":43,"W1":64} zdist/5t=[3,3,3,3,3,3,2,2,2,2,2,2] errs=-
- #9 sealed sealed@65 end@104 adj@- stale=0 placeCalls ok/fail=4/0 first@0 pre=[S0,N0,S1,N1,R] open=[E0,E1] solidAt={"E0":1,"W0":22,"E1":43,"W1":64} zdist/5t=[3,3,3,3,3,3,2,2,2,2,2,2] errs=-
- #10 sealed sealed@65 end@105 adj@- stale=0 placeCalls ok/fail=4/0 first@0 pre=[S0,N0,S1,N1,R] open=[E0,E1] solidAt={"E0":1,"W0":22,"E1":43,"W1":64} zdist/5t=[3,3,3,3,3,3,2,2,2,2,2,2] errs=-

### TUNNEL-OPEN-BOTH (8hp, zombie 8 away)
- #1 sealed sealed@65 end@108 adj@- stale=0 placeCalls ok/fail=4/0 first@0 pre=[S0,N0,S1,N1,R] open=[E0,E1] solidAt={"E0":1,"W0":22,"E1":43,"W1":64} zdist/5t=[8,8,8,8,8,8,7,7,6,5,5,4] errs=-
- #2 sealed sealed@66 end@108 adj@- stale=0 placeCalls ok/fail=4/0 first@0 pre=[S0,N0,S1,N1,R] open=[E0,E1] solidAt={"E0":2,"W0":23,"E1":44,"W1":65} zdist/5t=[8,8,8,8,8,8,7,7,6,5,5,4] errs=-
- #3 sealed sealed@67 end@107 adj@- stale=0 placeCalls ok/fail=4/0 first@0 pre=[S0,N0,S1,N1,R] open=[E0,E1] solidAt={"E0":1,"W0":22,"E1":44,"W1":66} zdist/5t=[8,8,8,8,8,8,7,6,6,5,5,4] errs=-
- #4 sealed sealed@65 end@106 adj@- stale=0 placeCalls ok/fail=4/0 first@0 pre=[S0,N0,S1,N1,R] open=[E0,E1] solidAt={"E0":1,"W0":22,"E1":43,"W1":64} zdist/5t=[8,8,8,8,8,8,7,7,6,5,5,4] errs=-
- #5 sealed sealed@66 end@106 adj@- stale=0 placeCalls ok/fail=4/0 first@0 pre=[S0,N0,S1,N1,R] open=[E0,E1] solidAt={"E0":1,"W0":22,"E1":44,"W1":65} zdist/5t=[8,8,8,8,8,8,7,6,6,5,5,4] errs=-
- #6 sealed sealed@65 end@105 adj@- stale=0 placeCalls ok/fail=4/0 first@0 pre=[S0,N0,S1,N1,R] open=[E0,E1] solidAt={"E0":1,"W0":22,"E1":43,"W1":64} zdist/5t=[8,8,8,8,8,8,8,8,8,8,8,8] errs=-
- #7 sealed sealed@65 end@106 adj@- stale=0 placeCalls ok/fail=4/0 first@0 pre=[S0,N0,S1,N1,R] open=[E0,E1] solidAt={"E0":1,"W0":22,"E1":43,"W1":64} zdist/5t=[8,8,8,8,8,8,7,6,6,5,5,4] errs=-
- #8 sealed sealed@65 end@106 adj@- stale=0 placeCalls ok/fail=4/0 first@0 pre=[S0,N0,S1,N1,R] open=[E0,E1] solidAt={"E0":1,"W0":22,"E1":43,"W1":64} zdist/5t=[8,8,8,8,8,8,7,6,6,5,5,4] errs=-
- #9 sealed sealed@66 end@108 adj@- stale=0 placeCalls ok/fail=4/0 first@0 pre=[S0,N0,S1,N1,R] open=[E0,E1] solidAt={"E0":2,"W0":23,"E1":44,"W1":65} zdist/5t=[8,8,8,8,8,8,7,7,6,5,5,4] errs=-
- #10 sealed sealed@65 end@105 adj@- stale=0 placeCalls ok/fail=4/0 first@0 pre=[S0,N0,S1,N1,R] open=[E0,E1] solidAt={"E0":1,"W0":22,"E1":43,"W1":64} zdist/5t=[8,8,8,8,8,8,7,7,6,5,5,4] errs=-

## Findings (shelter)

- Dominant failure: (b) entity in the target cell, in every unsealed run (a/c/d = 0 in all 15 scenarios; no equip errors, no missing items, no other placement errors; all failures are "Server refused to place cobblestone"). Those failures are the zombie standing in E0/E1 (or N1 once) when the bot tries the cell, so it is a race lost to arrival time: placing costs ~11 ticks per block on the flat (~92 ticks for 9 cells), ~21 ticks per block in a tunnel (4 blocks, seal ~66 ticks), and a zombie 8 away is adjacent at ~85 ticks.
- Zombie 1 away in a tunnel or flat world: never sealed (0/10 everywhere). The zombie spawns inside the first cell to fill (E0), so the cell can never be placed; without killing it, shelter cannot work here. At 8 hp 7-10 of 10 died.
- Zombie 3 or 8 away in a tunnel: 10/10 sealed at 20 hp and at 8 hp, closed and open-both alike, zero hp lost; the first placement lands at tick 1-4 and the zombie never reaches the bot.
- Flat SEAL-FAR (8 away) is a coin-flip race: 8/10 here (the unsealed ones are one ghost-zombie fixture artifact and one real loss at adj@68).
- Fixture artifacts found (both fixed in the test): (1) a killed zombie stays in bot.entities for ~1-2 s and `nearestEntity` returned it as the adjacent zombie of the next trial; (2) the bot's chunk view lags behind /fill, so wall cells were seen stale (column `stale=` / "runs with stale view"; the test now waits until the bot's view matches `/execute if block`). The earlier "SEAL-FAR 0/10 and 6/10" swings and the first run of this task (9/10) came from these. The FIGHT rows changed after the ghost wait (0-1/10 "ok_but_zombie_alive"): the old 3-6/10 wins probably counted ghost zombies vanishing from bot.entities as kills, and the fight win check is not trustworthy; unverified.
- Once sealed, the test kills the zombie to skip the 30 s wait, so hp lost and ticks are up to the seal.
