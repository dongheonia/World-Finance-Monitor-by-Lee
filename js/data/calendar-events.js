const WAR_EVENTS = [
    { ko: "우크라이나 동부 (돈바스 전선)", en: "Eastern Ukraine (Donbas front line)", coords: [37.8, 48.3], radius: 180,
      reasonKo: "러시아와 우크라이나 간 전면전이 진행 중인 실제 교전 지역으로, 포격과 병력 손실이 계속 보고되고 있습니다.",
      reasonEn: "Active front line in the ongoing Russia-Ukraine war, with continued shelling, troop losses, and territorial fighting." },
    { ko: "가자지구", en: "Gaza Strip", coords: [34.35, 31.4], radius: 25,
      reasonKo: "이스라엘군과 하마스 간 군사 충돌로 대규모 민간인 사상자와 시설 파괴가 발생한 지역입니다.",
      reasonEn: "Site of Israel-Hamas military conflict, with large-scale civilian casualties and destruction of infrastructure." },
    { ko: "남부 레바논", en: "Southern Lebanon", coords: [35.3, 33.2], radius: 35,
      reasonKo: "헤즈볼라와 이스라엘군 간 국경 교전 및 공습으로 사상자가 발생하고 있는 지역입니다.",
      reasonEn: "Cross-border fighting and airstrikes between Hezbollah and Israeli forces, with reported casualties." },
    { ko: "이란 (이스라엘·미국 공습 피해 지역)", en: "Iran (struck by Israel/US)", coords: [53.5, 32.4], radius: 200,
      reasonKo: "이스라엘·미국의 군사 공습으로 인명 피해와 핵·군사 시설 파괴가 발생한 지역입니다.",
      reasonEn: "Struck by Israeli and US military airstrikes, causing casualties and damage to nuclear/military facilities." },
    { ko: "수단 (다르푸르·하르툼)", en: "Sudan (Darfur / Khartoum)", coords: [29.5, 13.5], radius: 300,
      reasonKo: "수단군과 신속지원군(RSF) 간 내전으로 대량 민간인 학살과 대규모 난민이 발생한 지역입니다.",
      reasonEn: "Civil war between Sudan's army and the RSF paramilitary, causing mass civilian killings and displacement." },
    { ko: "미얀마 내전 지역", en: "Myanmar civil war", coords: [96.0, 21.0], radius: 250,
      reasonKo: "군부와 반군 세력 간 무력 충돌이 이어지며 공습과 전투로 인명 피해가 발생하는 지역입니다.",
      reasonEn: "Ongoing armed conflict between the military junta and resistance forces, with airstrikes and combat casualties." },
    { ko: "예멘", en: "Yemen", coords: [44.5, 15.5], radius: 200,
      reasonKo: "후티 반군과 정부군·연합군 간 무력 충돌 및 공습이 지속되고 있는 지역입니다.",
      reasonEn: "Continued armed clashes and airstrikes between Houthi rebels and government/coalition forces." },
    { ko: "파키스탄-아프가니스탄 접경", en: "Pakistan-Afghanistan border", coords: [70.5, 33.8], radius: 120,
      reasonKo: "탈레반 및 무장단체와 파키스탄군 간 국경 교전과 공습으로 사상자가 발생하는 지역입니다.",
      reasonEn: "Cross-border clashes and airstrikes between Pakistani forces and militant groups, with casualties." },
    { ko: "콩고민주공화국 동부 (북키부)", en: "Eastern DR Congo (North Kivu)", coords: [29.2, -1.5], radius: 140,
      reasonKo: "M23 반군과 정부군 간 무력 충돌로 민간인 학살과 대규모 피란이 발생한 지역입니다.",
      reasonEn: "Fighting between M23 rebels and government forces has caused civilian massacres and mass displacement." },
    { ko: "카슈미르 (인도-파키스탄 국경)", en: "Kashmir (India-Pakistan LoC)", coords: [75.0, 34.3], radius: 80,
      reasonKo: "인도와 파키스탄 군 간 통제선(LoC) 상 포격과 무력 충돌이 반복되는 지역입니다.",
      reasonEn: "Recurring cross-border shelling and armed clashes between Indian and Pakistani forces along the LoC." },
    { ko: "말리·사헬 지역", en: "Mali / Sahel region", coords: [-3.0, 17.0], radius: 350,
      reasonKo: "이슬람 극단주의 무장세력과 정부군 간 전투가 이어지며 민간인 피해가 발생하는 지역입니다.",
      reasonEn: "Ongoing fighting between jihadist armed groups and government forces, with civilian casualties." }
];

// Manually curated, best-effort snapshot of structural/breaking economic risk —
// things that move global markets, supply chains, or monetary policy (rate moves,
// sanctions taking effect, supply-chain choke points, border/trade closures) — NOT
// routine scheduled indicator releases (CPI prints, jobs reports, etc). Shown as blue
// dots on the map; unlike war events these are single points, not affected-area circles.
const ECONOMY_EVENTS = [
    { ko: "홍해·바브엘만데브 해협 해운 리스크", en: "Red Sea / Bab-el-Mandeb shipping risk", coords: [43.4, 12.6],
      reasonKo: "후티 반군의 상선 공격으로 다수 해운사가 홍해 항로를 우회하면서 글로벌 해상 운임과 운송 기간이 급등했습니다.",
      reasonEn: "Houthi attacks on merchant shipping have pushed carriers to reroute around the Red Sea, sharply raising global freight rates and transit times." },
    { ko: "파나마 운하 통항 제한", en: "Panama Canal transit restrictions", coords: [-79.9, 9.1],
      reasonKo: "가뭄에 따른 수위 저하로 일일 통항 선박 수가 제한되면서 태평양-대서양 물류에 병목이 발생하고 있습니다.",
      reasonEn: "Drought-driven low water levels have capped daily vessel transits, creating a bottleneck in Pacific-Atlantic shipping logistics." },
    { ko: "중국 핵심광물·반도체 수출 통제", en: "China export controls on critical minerals/chips", coords: [116.4, 39.9],
      reasonKo: "희토류 등 핵심 광물과 반도체 관련 품목에 대한 수출 통제로 글로벌 공급망 차질 우려가 커지고 있습니다.",
      reasonEn: "Export controls on rare earths and semiconductor-related items have raised concerns about disruption across global supply chains." },
    { ko: "러시아산 에너지 제재", en: "Sanctions on Russian energy exports", coords: [37.6, 55.8],
      reasonKo: "서방의 원유·가스 수출 제재 이행으로 유럽 에너지 가격 변동성과 대체 공급선 확보 부담이 커지고 있습니다.",
      reasonEn: "Enforcement of Western sanctions on oil and gas exports is driving European energy price volatility and a scramble for alternative supply." },
    { ko: "대만해협 긴장·반도체 공급망 리스크", en: "Taiwan Strait tensions / chip supply-chain risk", coords: [121.0, 23.7],
      reasonKo: "양안 군사적 긴장 고조가 전 세계 첨단 반도체 공급망의 핵심 거점인 대만發 생산·물류 리스크로 이어지고 있습니다.",
      reasonEn: "Rising cross-strait military tension is feeding into production and logistics risk centered on Taiwan, a linchpin of the global advanced-chip supply chain." },
    { ko: "튀르키예 리라화 방어 긴급 금리 인상", en: "Turkey emergency rate hike to defend the lira", coords: [32.9, 39.9],
      reasonKo: "통화 가치 급락을 방어하기 위한 중앙은행의 긴급 기준금리 인상이 신흥국 자금 흐름 전반에 영향을 주고 있습니다.",
      reasonEn: "The central bank's emergency policy-rate hike to defend a sliding currency is rippling through broader emerging-market capital flows." },
    { ko: "수에즈 운하 통항 리스크", en: "Suez Canal transit risk", coords: [32.5, 30.6],
      reasonKo: "지정학적 긴장과 안전 우려로 일부 선사가 수에즈 항로를 회피하면서 유럽-아시아 물류 비용이 상승하고 있습니다.",
      reasonEn: "Geopolitical tension and safety concerns have led some carriers to avoid the Suez route, raising Europe-Asia logistics costs." },
    { ko: "미 연준 통화정책 불확실성", en: "Fed policy-rate uncertainty", coords: [-77.0, 38.9],
      reasonKo: "연방준비제도의 통화정책 경로에 대한 불확실성이 전 세계 금리·환율·주식시장 변동성을 키우고 있습니다.",
      reasonEn: "Uncertainty over the Federal Reserve's policy path is amplifying volatility across global rates, currencies, and equity markets." }
];

// Manually curated, best-effort snapshot of major active natural disasters (source-
// checked 2026-07-30) — shown as yellow-bordered/pale-yellow circles on the map, same
// "approximate real-world affected radius" approach as WAR_EVENTS.
const DISASTER_EVENTS = [
    { ko: "아이다호 산불 (빅그래스 화재)", en: "Idaho wildfires (Big Grass Fire)", coords: [-116.2, 42.5], radius: 60,
      reasonKo: "오와이히군을 중심으로 산불이 번지면서 아이다호 주지사가 재난 비상사태를 선포하고 주 방위군을 투입했습니다.",
      reasonEn: "Idaho's governor declared a disaster emergency and deployed the National Guard as the Big Grass Fire spread through Owyhee County." },
    { ko: "구마모토 강진 (일본)", en: "Kumamoto earthquake, Japan", coords: [130.74, 32.79], radius: 130,
      reasonKo: "규모 7.1 지진이 구마모토를 강타해 최소 1명이 사망하고 건물이 붕괴했으며 짧은 쓰나미 경보가 발령됐습니다.",
      reasonEn: "A magnitude-7.1 earthquake struck Kumamoto, killing at least one person, collapsing buildings, and triggering a brief tsunami alert." },
    { ko: "아삼 홍수 (인도)", en: "Assam floods, India", coords: [91.73, 26.14], radius: 160,
      reasonKo: "브라마푸트라강 범람으로 최소 50명이 사망하고 70만 명이 대피하는 등 대규모 피해가 발생했습니다.",
      reasonEn: "The Brahmaputra River overflowed after days of monsoon rain, killing at least 50 people and displacing 700,000." },
    { ko: "광시 홍수 (중국)", en: "Guangxi floods, China", coords: [109.0, 24.3], radius: 150,
      reasonKo: "폭우로 다수의 하천이 범람하고 저수지 댐이 붕괴해 최소 39명이 사망하고 9명이 실종됐습니다.",
      reasonEn: "Heavy storms burst a reservoir dam and overflowed multiple rivers, leaving at least 39 dead and 9 missing." },
    { ko: "필리핀 태풍·몬순 홍수", en: "Philippines typhoon/monsoon flooding", coords: [121.0, 15.5], radius: 180,
      reasonKo: "태풍 바비와 남서 몬순이 겹치며 약 73만 8천 명이 피해를 입고 21명이 사망했습니다.",
      reasonEn: "Tropical Cyclone Bavi combined with the enhanced Southwest Monsoon to affect roughly 738,000 people and kill 21." },
    { ko: "파키스탄 몬순 홍수", en: "Pakistan monsoon floods", coords: [70.4, 30.3], radius: 200,
      reasonKo: "몬순 폭우로 홍수 경보가 발령되고 대피가 이어지며 최소 47명이 사망했습니다.",
      reasonEn: "Monsoon rains triggered flood alerts and evacuations across multiple provinces, leaving at least 47 dead." },
    { ko: "칠레 산불 (비오비오·뉴블레)", en: "Chile wildfires (Biobío/Ñuble)", coords: [-72.35, -37.47], radius: 80,
      reasonKo: "대형 산불로 주택 325채가 파괴돼 대통령이 비오비오·뉴블레 지역에 재해 사태를 선포했습니다.",
      reasonEn: "President Boric declared a state of catastrophe in the Biobío and Ñuble regions after wildfires destroyed 325 homes." },
    { ko: "유타 산불·홍수 (미국)", en: "Utah wildfires and flooding, US", coords: [-112.4, 38.3], radius: 90,
      reasonKo: "몬순 폭우와 산불이 겹치며 비버·퓨트·세비어 카운티에 비상사태가 선포됐습니다.",
      reasonEn: "Utah's governor declared a state of emergency across Beaver, Piute, and Sevier counties after wildfires and monsoon flooding." }
];

// Manually curated, best-effort snapshot of major social-impact incidents — crime,
// terrorism, and mass-migration events with significant human/social consequences
// (source-checked 2026-08-01), deliberately excluding war and natural-disaster events
// already covered by WAR_EVENTS/DISASTER_EVENTS. Shown as purple dots on the map, same
// single-point approach as ECONOMY_EVENTS.
const SOCIAL_EVENTS = [
    { ko: "세우타 난민 위기 (스페인-모로코 국경)", en: "Ceuta migrant crisis (Spain-Morocco border)", coords: [-5.32, 35.89],
      reasonKo: "모로코발 대규모 월경 시도로 하루 만에 최소 6만 명이 세우타로 진입해 최소 34명이 사망했으며, 스페인은 군을 투입했습니다.",
      reasonEn: "A mass border rush from Morocco saw at least 60,000 people enter Ceuta in a single day, leaving at least 34 dead; Spain deployed its military in response." },
    { ko: "베를린 프라이드 차량 돌진 테러 (독일)", en: "Berlin Pride car-ramming attack, Germany", coords: [13.405, 52.52],
      reasonKo: "베를린 프라이드 행진에 차량이 돌진해 1명이 숨지고 20명이 다쳤으며, 용의자는 과거 IS 가담을 시도한 전력이 있습니다.",
      reasonEn: "A car rammed into Berlin's Pride march, killing one and injuring 20; the suspect had a prior record of attempting to join ISIS." },
    { ko: "빈터투어 흉기 난동 (스위스)", en: "Winterthur stabbing attack, Switzerland", coords: [8.72, 47.50],
      reasonKo: "빈터투어 기차역에서 IS에 영감을 받은 흉기 난동으로 3명이 찔려 당국이 테러로 규정했습니다.",
      reasonEn: "An ISIS-inspired stabbing spree at Winterthur railway station wounded three people; authorities classified it as a terrorist attack." },
    { ko: "리에주 시나고그 폭발 (벨기에)", en: "Liège synagogue explosion, Belgium", coords: [5.57, 50.63],
      reasonKo: "이란과 연계된 것으로 추정되는 조직이 시나고그 앞에서 폭발물을 터뜨려 반유대주의 테러로 규정됐고, 벨기에는 유대인 시설에 군을 배치했습니다.",
      reasonEn: "A suspected Iran-linked group detonated an IED outside a synagogue, prompting Belgium to brand it antisemitic terrorism and deploy troops to Jewish sites." },
    { ko: "골더스 그린 흉기 테러 (영국)", en: "Golders Green attack, UK", coords: [-0.194, 51.572],
      reasonKo: "런던 골더스 그린에서 유대인 남성 2명이 흉기에 찔리는 반유대주의 테러가 발생해 정부가 긴급 대책회의를 열었습니다.",
      reasonEn: "Two Jewish men were stabbed in an antisemitic terror attack in London's Golders Green, prompting an emergency government response meeting." },
    { ko: "이스탄불 이스라엘 총영사관 공격 (튀르키예)", en: "Attack on Israeli consulate, Istanbul, Turkey", coords: [28.98, 41.01],
      reasonKo: "미국·이스라엘의 이란 공격 이후 고조된 긴장 속에 이스탄불 주재 이스라엘 총영사관이 공격 대상이 됐습니다.",
      reasonEn: "The Israeli consulate in Istanbul was targeted amid heightened tensions following the US-Israeli strikes on Iran." }
];

// ============================ MARKET DATA ============================

// `hours` drives the open/closed dot next to each exchange name — local trading-day
// sessions (24h "HH:MM-HH:MM", multiple entries where the exchange has a lunch break),
// checked in that exchange's own timezone with weekends always closed. This is regular-
// session hours only — holidays aren't accounted for, so it's best-effort like the rest
// of the app's curated data, not an authoritative market-status feed.
