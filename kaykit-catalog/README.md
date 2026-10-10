# KayKit 에셋 도감 (새 게임 만들 때 어느 에셋을 쓸지 찾는 곳)

에셋 보관 폴더: `C:\Users\user\Downloads\3d-assets\organized` (KayKit 21개 + Quaternius 6개 + Kenney 3개 팩의 glTF 를 용도별로 정리한 것. FBX·OBJ 원본 팩 폴더는 2026-10-03 에 지웠다 — 필요하면 각 사이트에서 다시 받는다). 저장소에는 게임에 쓰는 것만 `assets/kaykit/` 에 둔다(KayKit 172개 + 우주전쟁용 `assets/kaykit/war/`).
조사한 날: 2026-10-03(KayKit), 2026-10-09(Quaternius·Kenney 추가), 2026-10-10(KayKit Adventurers EXTRA·Skeletons EXTRA·Character Animations 1.1 의 Rig_Large 추가). 보관 폴더 이름은 `allkaykit` 에서 `3d-assets` 로 바꿨다(2026-10-09). 옛 이름 `Downloads\allkaykit` 은 새 폴더를 가리키는 바로가기(junction)로 남겨 두었다 — 옛 경로를 쓰던 것이 없으면 지워도 된다. 도구 이름(`kaykit-*`)과 `assets/kaykit/` 는 그대로다.
`organized` 에 팩을 더 넣으면 아래 명령으로 도감을 다시 만든다. 새 팩을 받았을 때는 `node tools/kaykit-organize-extra.js "C:\Users\user\Downloads" "C:\Users\user\Downloads\3d-assets\organized"` 의 계획표(`ExtraPackPlan`)에 줄을 더해 복사한 뒤 도감을 만든다(끊어진 텍스처 연결을 자동 검사).

```bash
node tools/kaykit-catalog.js "C:\Users\user\Downloads\3d-assets\organized" assets\kaykit kaykit-catalog
```

## 찾는 법 (3단계)

1. **이 파일**에서 팩·용도를 고른다 (아래 2·5절).
2. **빠른 검색**: `node tools/kaykit-find.js 단어 [단어…]` — 이름·폴더·애니메이션 클립 이름에서 모든 단어가 들어간 모델을 `팩 | 파일 | 삼각형 | 크기 | KB` 로 보여 준다. 예: `node tools/kaykit-find.js melee stab`, `node tools/kaykit-find.js tree`.
3. **전체 이름표**: [names.md](names.md) — 팩·폴더별 모든 모델 이름과 애니메이션 클립 이름·길이. `*` 는 이미 저장소 `assets/kaykit/` 에 복사된 것. 삼각형·크기·재질 등 전체 자료는 `catalog.json`.

## 1. 쓰는 방법 (공통)

- 모든 팩은 **glTF** 를 쓴다(three.js `GLTFLoader`). 대부분 `.gltf` + `.bin` + 팩 공용 텍스처 PNG 한 장 조합이라 **`.gltf`·`.bin`·PNG 를 같은 폴더에 같이 복사**해야 한다. 캐릭터·애니메이션·Medieval Builder·Skeleton 은 `.glb` 한 파일.
- 소품 팩은 모델마다 색을 따로 칠하지 않고 **텍스처 한 장(색 칸 격자)** 을 공유한다(`dungeon_texture.png` 등). 같은 팩 모델끼리는 재질이 같아 한 번에 묶어 그리기 좋다.
- 모델은 전부 저폴리(대부분 수십~수백 삼각형, 캐릭터 5천~9천)라서 갤럭시탭 S7 에서도 수백 개 놓을 수 있다. 캐릭터는 한 장면에 수십 명 이하로.
- 라이선스: KayKit 팩 전부 CC0(Kay Lousberg), Fantasy Props MegaKit 도 CC0(Quaternius). 출처 표기 의무 없음.
- `tools` 가 읽은 크기(`size`)는 모델 좌표 기준 가로×높이×깊이(단위는 대략 미터). 무기는 길이가 Y 축.

## 2. 팩 한눈에 보기

| 팩 (원본 폴더 이름) | 모델 | 내용 | 이럴 때 쓴다 |
|---|---|---|---|
| **KayKit_Adventurers_2.0_FREE** | 31 + 캐릭터 6 | 모험가 6종(Barbarian·Knight·Mage·Ranger·Rogue·Rogue_Hooded)과 그들의 무기·방패·화살·마법책·지팡이·술잔 | 3D 액션·배틀·RPG 의 주인공/아군/적. **glb 는 `organized/characters/adventurers/` 와 저장소 `assets/kaykit/characters/` 에 있음(FBX 원본은 삭제)** |
| **KayKit_Skeletons_1.1_FREE** | 17 + 캐릭터 4 | 스켈레톤 4종(Warrior·Mage·Rogue·Minion)과 전용 무기·방패·화살·석궁 | 몬스터·적·좀비류. 모험가와 **같은 뼈대(Rig_Medium)** 라 애니메이션을 그대로 공유 |
| **KayKit_Adventurers_2.0_EXTRA** (2026-10-10) | 캐릭터 +3, 소품 여러 개 | 새 캐릭터 **Engineer(공학자)·Druid(드루이드)·Barbarian_Large(대형 바바리안)**, 새 소품 `turret_base`(포탑 받침)·`engineer_Wrench`·`druid_staff`·`*_Large` 무기(도끼·방패·술잔)·큰 물약. 모든 캐릭터에 **색 변형 텍스처 `_alt_A/B/C` 3벌**(총 28장) | 모험가 편 병력. FREE 6종에 3종이 더해져 9종. 텍스처 한 장이 glb 안에 내장되어 있어 색 변형은 `characters/adventurers/textures/*_alt_*.png` 로 갈아 끼운다 |
| **KayKit_Skeletons_1.1_EXTRA** (2026-10-10) | 캐릭터 +2, 소품 여러 개 | **Skeleton_Golem(골렘, 키 약 4.2m)·Necromancer(사령술사, 왕관)**, 소품: 골렘 도끼(보통·`_Large`)·철퇴(보통·`_Large`)·낫(Scythe)·단검·큰 방패 A/B·작은 방패 A/B. 텍스처 `skeleton_texture_A/B` | 해골 편 병력 |
| **KayKit Character Animations 1.1** (2026-10-10) | 애니 Rig_Medium 8 + **Rig_Large 6**, 마네킹 2 | 같은 동작 묶음을 **두 뼈대용으로** 제공. `Mannequin_Medium/Large` 는 뼈대 시험용 | 대형 캐릭터(골렘·대형 바바리안)에 쓸 **Rig_Large 동작** |
| **KayKit Character Animations 1.2** | 3 + 애니 30 | Prototype Pete(마네킹 캐릭터)·연필·케이스, 그리고 **그 캐릭터 전용 애니메이션 30개** | 단순한 마네킹 주인공. 뼈대가 달라 Rig_Medium 캐릭터와는 호환 안 됨 |
| **Fantasy Props MegaKit (Quaternius)** | 93 | 판타지 소품: 상자·통·책·촛대·양초·물약·열쇠·침대·책상·탁자·모루·허수아비·노점 등. **PBR(법선·ORM) 텍스처** 사용, Chest_Wood 는 열고 닫는 애니메이션 | 실내(방·여관·상점)를 꾸밀 때. KayKit 보다 사실적이라 분위기가 다름 |
| **KayKit_Dungeon_Pack_1.1_FREE** | 211 | 벽·바닥·계단·기둥·문틀·횃불·배너·상자·통·침대·탁자·열쇠·금화·선반 | 던전·성 내부·미로·방 탈출. 벽/바닥 모듈형 조립 |
| **KayKit Medieval Builder Pack 1.0** | 226 | 육각(128)·정사각(68) 땅 타일(숲·바위·모래·물·길·강 변형)과 건물 30개(성·집·풍차·시장…) | 타일 맵(전략·타워 디펜스·땅따먹기). glb. 정사각 타일 2×2 |
| **KayKit_Medieval_Hexagon_Pack_1.0_FREE** | 221 | 육각 타일(풀·해안·강·길)·**5가지 팀 색(파랑·초록·빨강·노랑·중립)의 건물 18종**·산·언덕·나무·구름·소품 | 팀 대전형 점령·전략 게임 — 색별 건물이 이미 있음 |
| **KayKit_Forest_Nature_Pack_1.0_FREE** | 105 | 나무(활엽·침엽·죽은 나무)·덤불·바위(3종 40여 개)·풀 | 숲·들판 배경. 풀은 한 면(Singlesided)/양면 |
| **KayKit_City_Builder_Bits_1.0_FREE** | 41 | 건물 8종·도로 조각(직선·코너·교차로)·자동차 5대·가로등·신호등·소화전 | 도시 배경, 자동차 게임, 교통 퀴즈 |
| **KayKit_Restaurant_Bits_1.0_FREE** | 144 | 주방(조리대·가스레인지·오븐·냉장고)·그릇·냄비·**음식 재료 낱개와 손질 단계별(통째·썰기·익힘·탄 것)**·버거 | 요리·식당 경영 게임 (오버쿡드 식) |
| **KayKit_Furniture_Bits_1.0_FREE** | 53 | 침대·소파·의자·책장·서랍장·램프·그림 액자·러그·선인장 | 집 꾸미기·방 구성 |
| **KayKit_HalloweenBits_1.0_FREE** | 63 | 호박·묘비·관·납골당·울타리·죽은 나무·뼈·해골·랜턴·제단 | 공포·할로윈 스테이지, 묘지 탐험 |
| **KayKit_Holiday_Bits_1.0_FREE** | 98 | **선물 상자 5색×6모양**·크리스마스 트리·눈사람·진저브레드·**기차(기관차·화차·선로)**·스노볼·농구공·축구공 | 겨울 이벤트, 선물 모으기, 기차 게임 |
| **KayKit_BoardGameBits_1.0_FREE** | 162 | **주사위(D4·D6·D8·D20)·말(폰·미플)·동전·도미노 28장·토큰·모래시계**·깃발·플레이어 카드/타일(영웅·스켈레톤) | 보드게임·주사위 게임·카드/도미노 |
| **KayKit_BlockBits_1.0_FREE** | 40 | 마인크래프트식 블록(흙·잔디·눈·모래·물·용암·유리·광석·나무) | 블록 쌓기·샌드박스·복셀 지형 |
| **KayKit_Prototype_Bits_1.1_FREE** | 72 | 회색 기본 도형(큐브·경사·계단·벽·문·바닥)·표적·허수아비·통·상자·동전 | 빠른 프로토타입, 사격 연습장, 장애물 코스 |
| **KayKit_ResourceBits_1.0_FREE** | 76 | 자원: 구리·금·은·철 괴/덩어리, 통나무·판자·돌벽돌, 천, 연료통, 톱니바퀴 부품 | 자원 채집·건설 경영 게임 |
| **KayKit_RPGToolsBits_1.0_FREE** | 49 | 도구: 망치·톱·삽·곡괭이·렌치·드라이버·연필·지도·두루마리·나침반·돋보기·횃불 | 제작/채집 게임, 도구 아이콘, 보물찾기 지도 |
| **KayKit_FantasyWeaponsBits_1.0_FREE** | 31 | 검 5·도끼 3·활 2·창·할버드·망치 3·방패 3·단검·지팡이·화살 | 무기 아이템. 캐릭터 손에 붙이거나 바닥 습득물로 |
| **KayKit_Space_Base_Bits_1.0_FREE** | 57 | 우주 기지 모듈·착륙선·화물·우주 트럭·터널·태양광 패널·풍력 터빈·지형 | 우주 기지 건설·탐사 게임 |
| **KayKit_Mixed_Bag_1_FREE** | 41 | 잡동사니: 기타·롤러스케이트·우산·타코·즉석카메라·퍼즐 큐브·서커스 천막·닭 인형·쇠사슬 | 이벤트·수집품·장식 |

### SF·우주 추가 팩 (2026-10-09, 모두 CC0) — `models/<폴더>` 또는 `characters/<폴더>`

| 폴더 | 만든 곳 | 모델 | 삼각형 | 내용 | 이럴 때 쓴다 |
|---|---|---|---|---|---|
| `characters/quaternius-mech` | Animated Mech Pack | 4종×(질감·단색)=8 | 2.4k~8.8k | 메카 George·Leela·Mike·Stan, **클립 18~20개**(Idle·Walk·Run·Shoot·Punch·Kick·SwordSlash·Death…). 크기 약 3~9m | 고급 병력·보스·거대 로봇 |
| `characters/quaternius-animated-characters` | Ultimate Animated Character Pack | 52 | 2.1k~9.8k | 사람형 52종(군인·닌자·기사·의사·요리사·카우보이·해적·엘프·고블린·소·퍼그…), **클립 16개**(Idle·Walk·Run·Jump·Punch·SwordSlash·Shoot_OneHanded·Death·Roll…) | 사람 병력·NPC·일꾼 |
| `models/quaternius-ultimate-space-kit` | Ultimate Space Kit | 92 | 96~8.6k | `characters`(우주비행사 4·메카 4·적 4, 클립 17~18개), `environment`(66: 행성 11·돔·집·기지·바위·식물·안테나), `items`(7), `vehicles`(로버 3·우주선 4) | 우주 기지·행성 탐사·병력 |
| `models/quaternius-ultimate-spaceships` | Ultimate Spaceships | 11 | 0.7k~8.3k | 우주선 11종(Bob·Challenger·Dispatcher·Executioner·Imperial·Insurgent·Omen·Pancake·Spitfire·Striker·Zenith) + `textures/<이름>/` 색 변형 PNG | 우주선 전투·배경 연출 |
| `models/quaternius-scifi-essentials` | Sci-Fi Essentials Kit | 37 | 0.3k~8.7k | 적 로봇 3(클립 있음)·총 6·상자·통·책상·선반·보급품·지뢰·위성 안테나 | 소품·SF 적 |
| `models/quaternius-modular-scifi` | Modular SciFi MegaKit | 190 | 2~11k | `Walls` 84·`Platforms` 38(문·계단·경사 포함)·`Props` 28·`Decals` 29·`Columns` 8·`Aliens` 3. **PBR 텍스처는 `textures/` 에 한 벌** | SF 실내·기지 건물 조립 |
| `models/kenney-space-kit` | Kenney Space Kit | 153 | 2~876 | 우주선(`craft_*`)·복도·로켓·기지 지붕·바위·크레이터·우주비행사 2·외계인·책상·컴퓨터. 아주 저폴리 | 대량 배치(수백 개), 저사양 기기 |
| `models/kenney-space-station` | Kenney Space Station Kit | 97 | 12~272 | 우주정거장 내부: 바닥·벽·문·침대·의자·컴퓨터·컨테이너·난간 | 실내·기지 |
| `models/kenney-modular-space` | Kenney Modular Space Kit | 40 | 4~10.9k | 복도·방·문·계단·템플릿 바닥/벽 모듈 | 모듈식 복도·방 조립 |

## 3. 캐릭터 (움직이는 것)

| 캐릭터 | 파일 | 삼각형 | 비고 |
|---|---|---|---|
| Barbarian / Knight / Mage / Ranger / Rogue / Rogue_Hooded | `organized/characters/adventurers/*.glb` (저장소 `assets/kaykit/characters/` 에도 있음) | 5.8k~8.9k | 뼈 23개 Rig_Medium. 텍스처는 `*_texture.png` 8열×4행 색 칸이라 `recolor` 로 팀 색 변경(30번 방식) |
| Skeleton_Warrior / Mage / Rogue / Minion | `organized/characters/skeletons/*.glb` (저장소에는 Warrior 만 없음) | 4.6k~5.9k | 뼈 23개 Rig_Medium. `Rig_Medium_Special` 에 스켈레톤 전용 클립 |
| PrototypePete | `organized/characters/prototype-pete/PrototypePete.gltf` | 약 4.9k | 몸/머리/팔 조각이 분리된 마네킹. 전용 애니 30개 |
| Mannequin_Medium / Large | `organized/characters/mannequin/*.glb` | 6.9k / 9.1k | 동작 시험용 마네킹. **Large 는 뼈 23개 Rig_Large(Rig_Large 동작 파일에 들어 있는 몸과 같음)**, Medium 은 뼈 21개로 Rig_Medium 캐릭터와 다름 |

### EXTRA 추가 캐릭터 도감 (2026-10-10, 뼈 23개·같은 뼈 이름)

| 캐릭터 | 파일 | 키(대략) | 삼각형 | 맞는 동작 묶음 | 특징·손에 쥐는 소품 | 쓸 곳(모험가 vs 해골 군단 안) |
|---|---|---|---|---|---|---|
| Druid | `characters/adventurers/Druid.glb` | 2.8m | 7.8k | Rig_Medium | 배낭, `druid_staff`, 마법 동작(Raise·Shoot·Spellcasting·Summon) | 회복 담당 |
| Engineer | `characters/adventurers/Engineer.glb` | 2.3m | 7.5k | Rig_Medium | 고글·배낭, `engineer_Wrench`, 도구 동작(망치질·Work), 전용 소품 `turret_base` | 공성·포탑 설치 |
| Barbarian_Large | `characters/adventurers/Barbarian_Large.glb` | 4.1m | 11.7k | **Rig_Large** | 곰 모자·모피·어깨 보호대, `axe_2handed_Large`·`axe_1handed_Large`·`shield_round_barbarian_Large` | 대형 근접 |
| Necromancer | `characters/skeletons/Necromancer.glb` | 2.4m | 6.0k | Rig_Medium | 왕관, `Skeleton_Staff`, 마법 동작 | 저주 시전 |
| Skeleton_Golem | `characters/skeletons/Skeleton_Golem.glb` | 4.2m | 5.8k | **Rig_Large** | 눈·턱 따로, `Skeleton_Golem_Axe(_Large)`·`Skeleton_Mace(_Large)` | 공성 |

**뼈대 판별 결과(2026-10-10, glb 를 직접 읽어 확인)**: 새 캐릭터 5종을 포함해 모든 KayKit 캐릭터와 Rig_Medium·Rig_Large 동작 파일의 **뼈가 23개이고 이름이 전부 같다.** 그래서 어떤 동작 파일이든 이름으로는 연결된다. **뼈 길이를 비교해 어느 몸에 맞는 동작인지도 확인했다**: Skeleton_Golem·Barbarian_Large 는 위팔 1.015·아래팔 0.581·엉덩이 1.041 로 **Rig_Large 동작의 뼈 길이와 소수점 셋째 자리까지 같고**, Knight·Druid·Necromancer 는 위팔 0.251·아래팔 0.242·엉덩이 0.406 으로 Rig_Medium 동작과 같다(Engineer·Rogue 등 나머지 Medium 키도 같은 뼈대). 그러니 **골렘·대형 바바리안에 Rig_Large 동작을 쓰는 것이 맞고, Medium 동작을 입히면 팔다리 길이가 4배 가까이 어긋난다.**
**쓰는 규칙**: 골렘·대형 바바리안 = `animations/rig-large/`, 나머지(Medium 키) = `animations/rig-medium/`. 사진은 `previews/kaykit-*.png`.

**Quaternius 캐릭터(2026-10-09 추가)** 는 뼈대가 달라 아래 Rig_Medium 애니메이션을 공유하지 못한다. 대신 **각 `.gltf` 안에 클립이 이미 들어 있다**(버퍼·텍스처도 `.gltf` 한 파일에 내장).

| 캐릭터 | 폴더 | 클립(이름은 같은 팩 안에서 공통) |
|---|---|---|
| 메카 4종(질감·단색) | `characters/quaternius-mech` | Idle·Walk·Run·Jump·Shoot·Punch·Kick·SwordSlash·HitRecieve_1/2·Death·Dance·Hello·Yes·No·Pickup·Run_Holding·Walk_Holding·Run_Tall·Walk_Tall (Leela·Mike·Stan 은 18개) |
| 사람형 52종 | `characters/quaternius-animated-characters` | Idle·Walk·Run·Jump·Roll·Punch·SwordSlash·Shoot_OneHanded·RecieveHit·Death·Defeat·PickUp·Walk_Carry·Run_Carry·SitDown·StandUp |
| 우주비행사·메카·적 12종 | `models/quaternius-ultimate-space-kit/characters` | Idle·Idle_Gun·Walk·Walk_Gun·Run·Run_Gun·Run_Gun_Shoot·Jump·Jump_Idle·Jump_Land·Duck·HitReact·Death·Punch·Weapon·Wave·Yes·No |
| 로봇 적 3·외계인 3 | `models/quaternius-scifi-essentials`, `models/quaternius-modular-scifi/Aliens` | 팩마다 다름 — `names.md` 맨 위 클립 목록 |

모든 Rig_Medium 캐릭터는 같은 뼈대이므로 **어느 캐릭터든 아래 Rig_Medium 애니메이션을 그대로 재생**할 수 있다(클립 이름으로 `AnimationMixer` 에 연결).

## 4. 애니메이션 — 클립이 들어 있는 파일

Rig_Medium 계열 8개 파일은 `organized/animations/rig-medium/` 에 있다(저장소 `assets/kaykit/animations/` 에는 게임이 쓰는 `teambattle_anims.glb` 만 둠). 클립 이름·길이 전체는 [names.md](names.md) 맨 위.

| 파일 | 클립 수 | 들어 있는 동작 |
|---|---|---|
| `Rig_Medium_General` | 15 | 대기(Idle_A/B)·피격(Hit_A/B)·죽음(Death_A/B + 쓰러진 자세)·상호작용·줍기·던지기·아이템 사용·등장(Spawn_Air/Ground) |
| `Rig_Medium_MovementBasic` | 11 | 걷기(Walking_A/B/C)·달리기(Running_A/B)·점프 5단계(Start·Idle·Land·Full_Short/Long) |
| `Rig_Medium_MovementAdvanced` | 13 | 웅크리기·기어가기·살금살금(Sneaking)·**구르기/회피 4방향(Dodge)**·옆걸음 달리기(Strafe)·뒤로 걷기·활/소총 든 채 달리기 |
| `Rig_Medium_CombatMelee` | 22 | 한손 베기/찌르기/점프 베기, 양손 베기/회전/찌르기, 쌍검, **막기(Block·Blocking·Block_Hit)**, 맨손 펀치/발차기 |
| `Rig_Medium_CombatRanged` | 20 | 권총·소총 조준/발사/장전, **활(당기기·조준·놓기)**, **마법(Raise·Shoot·Spellcasting·Summon)** |
| `Rig_Medium_Simulation` | 14 | 환호(Cheering)·손 흔들기·앉기/일어나기(의자·바닥)·눕기·팔굽혀펴기·윗몸일으키기 |
| `Rig_Medium_Tools` | 29 | 도끼질·삽질·곡괭이·망치질·톱질·**낚시 7단계**·자물쇠 따기·작업(Work_A~C)·물건 들기(Holding_A~C) |
| `Rig_Medium_Special` | 15 | 스켈레톤 전용(깨어남·죽음·부활·배회·도발)과 실험용 변신 |
| `teambattle_anims.glb` (`organized/animations/combined/`) | 약 40 | 30번 팀 배틀이 위 파일에서 골라 합친 것 |
| `organized/animations/prototype-pete/KayKit_AnimatedCharacter_v1.2.glb` | 30 | PrototypePete 전용: Idle·Walk·Run·Jump·Roll·Dash 4방향·Attack 계열·Block·Shoot·Dance·Cheer·Wave·Climbing·PickUp·Throw·Defeat 등 |

### Rig_Large (2026-10-10 추가, `organized/animations/rig-large/`) — 골렘·대형 바바리안용

| 파일 | 클립 수 | 들어 있는 동작 |
|---|---|---|
| `Rig_Large_General` | 6 | 대기(Idle_A·Idle_B 6초)·피격(Hit_A)·죽음(Death_A) |
| `Rig_Large_MovementBasic` | 3 | 걷기(Walking_A)·달리기(Running_A) |
| `Rig_Large_MovementAdvanced` | 5 | 구르기/회피 4방향(Dodge) |
| `Rig_Large_CombatMelee` | 16 | 한손 베기·찌르기, 양손 공격·**내려치기(Melee_2H_Slam 2.8초)**·양손 대기, 막기 5종, 쌍검, 맨손 대기·펀치·발차기·**강타(Melee_Unarmed_Smash 3.5초)** |
| `Rig_Large_Simulation` | 2 | 근육 자랑(Flexing 4.3초) |
| `Rig_Large_Special` | 2 | 변신 시험(EXPERIMENTAL_Large_Transform) |

**Medium 에는 있고 Large 에는 없는 것**: 원거리 전투(활·총·마법), 도구(Tools), 상호작용·줍기, 등장(Spawn), 죽음 B·피격 B, 걷기 B/C·달리기 B, 구르기 외 이동(웅크리기·옆걸음). 큰 병사는 근접 전투·이동·피격·죽음만 쓰면 되므로 부족하지 않지만, **대형 캐릭터에게 원거리·시전 동작은 줄 수 없다.**
EXTRA 팩 두 개 안의 `Animations/` 는 Rig_Medium·Rig_Large 의 General·MovementBasic 두 파일만 든 사본이라 따로 쓸 필요 없다(Character Animations 1.1 에 전부 들어 있음, 같은 크기로 확인).

고를 때 참고: 이름 끝이 `_Pose` 인 것은 길이 0초짜리 정지 자세, `T-Pose` 는 기준 자세. `Attack` 류는 1~2초, 죽음 B·소환(Summon)·낚시·곡괭이처럼 긴 것은 2.5~6초.

## 5. 게임 아이디어 → 에셋 바로 찾기

| 만들 게임 | 캐릭터·애니메이션 | 배경·소품 |
|---|---|---|
| 던전 탐험 / 방 탈출 | 모험가 + General·Movement·CombatMelee | Dungeon Pack(벽·바닥·계단·상자·열쇠), Fantasy Props(물약·두루마리) |
| 팀 점령 / 전략 | 모험가 + CombatMelee·Ranged | Medieval Hexagon(색별 건물·육각 타일), Forest Nature |
| 타일 맵 / 타워 디펜스 | 스켈레톤(적) | Medieval Builder 타일, Hexagon 건물 |
| 요리 / 식당 | 모험가 + Tools·Simulation | Restaurant Bits(주방·재료 단계별), Furniture |
| 보드게임 / 주사위 / 도미노 | (필요 없음) | BoardGameBits |
| 서바이벌 / 채집 / 낚시 | 모험가 + Tools(낚시·벌목·채굴) | Forest Nature, ResourceBits, RPGToolsBits |
| 공포 / 할로윈 | 스켈레톤 + Special | HalloweenBits, Dungeon |
| 겨울 / 선물 / 기차 | 모험가 + Simulation(환호) | Holiday Bits |
| 도시 / 자동차 | (자동차는 City Builder 5대) | City Builder Bits |
| 우주 기지 | 모험가 | Space Base Bits |
| 모험가 vs 해골 군단 RTS (우주전쟁 컨셉 변경안) | 모험가 9종(Knight·Ranger·Druid·Mage·Barbarian_Large·Engineer) + 해골 6종(Warrior·Rogue·Minion·Mage·Necromancer·Golem), 대형은 Rig_Large | Dungeon Pack·Halloween Bits(납골당·묘비)·Medieval Hexagon(색별 건물)·Forest Nature, 포탑은 `turret_base` |
| 우주 RTS·SF 전투 (우주전쟁) | 사람형 52종·메카 4종·우주비행사/메카(Space Kit) | KayKit Space Base + Kenney Space Kit(저폴리 대량) + Quaternius Modular SciFi(건물 조립) + Ultimate Space Kit(행성·돔·기지) |
| 우주선 전투·연출 | — | Ultimate Spaceships 11종(색 변형), Kenney `craft_*`, Space Kit `Spaceship_*` |
| SF 복도·실내 탈출 | 사람형 52종 + SF 로봇 적 | Modular SciFi MegaKit(벽·바닥·문), Kenney Modular Space·Space Station |
| 사격 / 활쏘기 | 모험가(Ranger) + CombatRanged | Prototype Bits(표적·벽), FantasyWeaponsBits(활·화살) |
| 블록 샌드박스 | 모험가 | BlockBits |
| 장애물 코스 / 프로토타입 | 모험가 + MovementBasic·Advanced | Prototype Bits(경사·계단·벽) |
| 집 꾸미기 | 모험가 + Simulation(앉기·눕기) | Furniture Bits, Fantasy Props |

## 6. 주의할 점

- **Quaternius·Kenney 팩(2026-10-09)**: 라이선스는 모두 CC0 (`licenses/` 에 팩별 사본). Quaternius 캐릭터·우주선·Space Kit 의 `.gltf` 는 버퍼·텍스처가 파일 안에 내장되어 **파일 하나만 복사**하면 된다. Essentials·Modular 는 `.bin` 과 PBR PNG(법선·ORM 포함, 느린 태블릿에는 무거움)를 쓴다. Modular 는 텍스처를 `models/quaternius-modular-scifi/textures/` 한 곳에 두고 각 `.gltf` 가 `../textures/…` 로 가리키므로 **폴더 구조째** 복사해야 한다(원본에서 경로를 고쳐 둠, 2026-10-09). Kenney 는 모델이 아주 작고 단색이라 갤럭시탭에서도 수백 개 가능하다(Space Station·Modular 의 `.glb` 는 같은 폴더의 `Textures/colormap.png` 를 쓰므로 폴더째 복사).
- 크기가 팩마다 다르다: KayKit 캐릭터 약 2m, Quaternius 사람형 약 2m, Quaternius 메카·Space Kit 우주비행사는 3~9m, Kenney 는 1 단위 ≈ 1m 로 작음, Modular 벽은 한 칸 약 4m. 쓰기 전에 `kaykit-find.js` 가 보여 주는 크기를 확인해 배율을 정한다.
- Quaternius 애니메이션 클립 이름은 `Run`·`Walk` 처럼 KayKit(`Running_A`)과 다르다. 두 팩 캐릭터를 섞을 때는 클립 이름 표를 따로 둔다.

- **EXTRA·Rig_Large (2026-10-10)**: 정리본에는 들어왔지만 **저장소 `assets/kaykit/` 에는 아직 복사하지 않았다**(적용은 컨셉 변경 세션에서). 새 캐릭터 glb 는 텍스처가 내장이라 `.glb` 한 파일만 복사하면 되고, 색 변형은 `characters/adventurers/textures/*_alt_*.png`(모험가)·`characters/skeletons/textures/skeleton_texture_A/B.png` 로 갈아 끼운다. 소품 `.gltf` 는 `.bin`·PNG 와 함께 복사한다. 새로 받은 팩은 `node tools/kaykit-organize-extra.js "C:\Users\user\Downloads" "C:\Users\user\Downloads\3d-assets\organized"` 의 계획표에 줄을 더해 복사한다(이미 있는 파일은 건너뛰는 `onlyNew` 옵션).
- Necromancer 가 어떤 손 소품을 쥐는지는 파일에 정해져 있지 않다(소품은 따로 붙이는 방식) — 어울리는 `Skeleton_Staff`·`Skeleton_Scythe` 를 붙여 보고 정한다.
- **저장소에 없는 것은 `organized` 에서 복사**한다: `.gltf` 는 `.bin`·텍스처 PNG 도 함께(폴더째). 복사 위치는 기존 구조(`assets/kaykit/dungeon|medieval|props|characters|animations|textures`)를 따른다.
- `assets/kaykit/props/` 는 여러 팩의 소품을 섞어 둔 곳이라 같은 이름이 다른 팩에도 있을 수 있다(예: `wall`, `coin`, `table_medium`). names.md 의 `*` 는 이름만 비교한 표시다.
- `Fantasy Props MegaKit[Standard]` 폴더 이름에 대괄호가 있어 PowerShell 에서는 `-LiteralPath` 로 읽어야 한다.
- FBX·OBJ·DAE 는 지웠다(웹에서는 glTF 만 씀). 블렌더 등에서 원본이 필요하면 KayKit 에서 팩을 다시 받는다.
- 3D 게임 성능·화질 자동 조절·메뉴 배경 규칙은 `CLAUDE.md` 의 3D 항목을 따른다.
