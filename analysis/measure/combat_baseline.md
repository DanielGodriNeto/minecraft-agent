# Combat baseline (existing shelter/fight skills)

SEAL ticks = ticks to first sealed state (else whole skill). Seal win = sealed at some tick and not dead. Fight win = ok, zombie dead or despawned, not dead.
hp via /damage

| scenario | n | win/seal | start hp | mean hp lost | mean ticks | deaths | reasons | held |
|---|---|---|---|---|---|---|---|---|
| SEAL-ADJ (20hp, zombie 1 away) | 10 | 0/10 | 20.0 | 4.6 | 117.9 | 0 | not_sealedx10 | cobblestonex10 |
| SEAL-ADJ-LOW (8hp, zombie 1 away) | 10 | 0/10 | 8.0 | 8.0 | 149.6 | 10 | not_sealed+diedx10 | handsx10 |
| SEAL-FAR (20hp, zombie 8 away) | 10 | 0/10 | 20.0 | 3.3 | 119.2 | 0 | not_sealedx10 | cobblestonex10 |
| FIGHT-1 iron_pickaxe | 10 | 3/10 | 20.0 | 1.0 | 138.3 | 0 | okx3 ok_but_zombie_alivex5 not_killedx2 | rotten_fleshx3 handsx6 carrotx1 |
| FIGHT-1 stone_sword | 10 | 6/10 | 20.0 | 0.3 | 72.3 | 0 | okx6 ok_but_zombie_alivex4 | stone_swordx10 |
| FIGHT-1 iron_sword | 10 | 5/10 | 20.0 | 0.0 | 57.5 | 0 | ok_but_zombie_alivex5 okx5 | iron_swordx10 |
