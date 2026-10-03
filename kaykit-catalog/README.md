# KayKit 에셋 도감 (새 게임 만들 때 어느 에셋을 쓸지 찾는 곳)

원본 폴더: `C:\Users\user\Downloads\allkaykit` (21개 팩, 파일 11,487개). 저장소에는 게임에 쓴 것만 `assets/kaykit/` 로 복사해 둔다.
조사한 날: 2026-10-03. 팩을 더 받으면 아래 명령으로 다시 만든다.

```bash
node tools/kaykit-catalog.js "C:\Users\user\Downloads\allkaykit" assets\kaykit kaykit-catalog
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
| **KayKit_Adventurers_2.0_FREE** | 31 + 캐릭터 6 | 모험가 6종(Barbarian·Knight·Mage·Ranger·Rogue·Rogue_Hooded)과 그들의 무기·방패·화살·마법책·지팡이·술잔 | 3D 액션·배틀·RPG 의 주인공/아군/적. **원본에는 캐릭터가 FBX 뿐이고 glb 는 저장소 `assets/kaykit/characters/` 에 변환해 둠** |
| **KayKit_Skeletons_1.1_FREE** | 17 + 캐릭터 4 | 스켈레톤 4종(Warrior·Mage·Rogue·Minion)과 전용 무기·방패·화살·석궁 | 몬스터·적·좀비류. 모험가와 **같은 뼈대(Rig_Medium)** 라 애니메이션을 그대로 공유 |
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

## 3. 캐릭터 (움직이는 것)

| 캐릭터 | 파일 | 삼각형 | 비고 |
|---|---|---|---|
| Barbarian / Knight / Mage / Ranger / Rogue / Rogue_Hooded | 저장소 `assets/kaykit/characters/*.glb` (원본은 `Characters/fbx`) | 5.8k~8.9k | 뼈 23개 Rig_Medium. 텍스처는 `*_texture.png` 8열×4행 색 칸이라 `recolor` 로 팀 색 변경(30번 방식) |
| Skeleton_Warrior / Mage / Rogue / Minion | `KayKit_Skeletons_1.1_FREE/.../characters/gltf/*.glb` (저장소에도 있음) | 4.6k~5.9k | 뼈 23개 Rig_Medium. `Rig_Medium_Special` 에 스켈레톤 전용 클립 |
| PrototypePete | 원본 `KayKit Character Animations 1.2/Models/gltf/PrototypePete.gltf` | 약 4.9k | 몸/머리/팔 조각이 분리된 마네킹. 전용 애니 30개 |

모든 Rig_Medium 캐릭터는 같은 뼈대이므로 **어느 캐릭터든 아래 Rig_Medium 애니메이션을 그대로 재생**할 수 있다(클립 이름으로 `AnimationMixer` 에 연결).

## 4. 애니메이션 — 클립이 들어 있는 파일

Rig_Medium 계열 8개 파일은 `assets/kaykit/animations/` 에 모두 있다(원본 allkaykit 에는 General·MovementBasic 두 개뿐). 클립 이름·길이 전체는 [names.md](names.md) 맨 위.

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
| `teambattle_anims.glb` (저장소) | 약 40 | 30번 팀 배틀이 위 파일에서 골라 합친 것 |
| `KayKit_AnimatedCharacter_v1.2.glb` (원본) | 30 | PrototypePete 전용: Idle·Walk·Run·Jump·Roll·Dash 4방향·Attack 계열·Block·Shoot·Dance·Cheer·Wave·Climbing·PickUp·Throw·Defeat 등 |

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
| 사격 / 활쏘기 | 모험가(Ranger) + CombatRanged | Prototype Bits(표적·벽), FantasyWeaponsBits(활·화살) |
| 블록 샌드박스 | 모험가 | BlockBits |
| 장애물 코스 / 프로토타입 | 모험가 + MovementBasic·Advanced | Prototype Bits(경사·계단·벽) |
| 집 꾸미기 | 모험가 + Simulation(앉기·눕기) | Furniture Bits, Fantasy Props |

## 6. 주의할 점

- **저장소에 없는 것은 먼저 복사**한다: 원본 `.gltf` 를 쓰려면 `.bin`·텍스처 PNG 도 함께. 복사 위치는 기존 구조(`assets/kaykit/dungeon|medieval|props|characters|animations|textures`)를 따른다.
- `assets/kaykit/props/` 는 여러 팩의 소품을 섞어 둔 곳이라 같은 이름이 다른 팩에도 있을 수 있다(예: `wall`, `coin`, `table_medium`). names.md 의 `*` 는 이름만 비교한 표시다.
- `Fantasy Props MegaKit[Standard]` 폴더 이름에 대괄호가 있어 PowerShell 에서는 `-LiteralPath` 로 읽어야 한다.
- FBX 는 이 도감에서 읽지 않았다(웹에서는 glTF 사용). 원본 FBX 만 있는 것: Adventurers 캐릭터 6종, Character Animations 의 낱개 애니 30개(`Single Animations/*.fbx`, 같은 내용이 glb 한 파일에 합쳐져 있음).
- 3D 게임 성능·화질 자동 조절·메뉴 배경 규칙은 `CLAUDE.md` 의 3D 항목을 따른다.
