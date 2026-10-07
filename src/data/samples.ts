import type { Artwork, Comment } from "../lib/types";
const base = import.meta.env.BASE_URL;
const rows = [
  {
    id: "wave",
    title: "神奈川沖浪裏",
    creator: "葛飾北斎",
    tags: ["青", "波", "構図", "動き"],
    description: "「冨嶽三十六景」より。",
    notes:
      "色・光｜藍色と紙の白。少ない色で奥行きがある。\n構図｜大きな波と小さな富士山の対比。\n動き｜波の先の曲線を追うと視線が中央へ戻る。",
    collection: "構図の引き出し",
    url: "https://www.artic.edu/artworks/24645",
  },
  {
    id: "lilies",
    title: "睡蓮の池に映る雲",
    creator: "クロード・モネ",
    tags: ["光", "水面", "色", "静けさ"],
    description: "水面の反射を観察する。",
    notes:
      "色・光｜緑と青の中に淡い光がある。\n質感｜短い筆触の重なりで水面が揺れて見える。",
    collection: "光と色",
    url: "https://en.wikipedia.org/wiki/Water_Lilies_(Monet_series)",
  },
  {
    id: "paris",
    title: "パリの通り、雨",
    creator: "ギュスターヴ・カイユボット",
    tags: ["雨", "余白", "遠近感"],
    description: "通りを横切る視線と人物の配置。",
    notes: "構図｜街灯が画面を分割している。\n色・光｜石畳の反射で雨を感じる。",
    collection: "構図の引き出し",
    url: "https://www.artic.edu/artworks/20684",
  },
  {
    id: "bedroom",
    title: "アルルの寝室",
    creator: "フィンセント・ファン・ゴッホ",
    tags: ["室内", "色", "遠近感"],
    description: "線と色の関係を観察する。",
    notes: "色・光｜壁の青と家具の暖色の対比。\n構図｜床板の線が奥へ向かう。",
    collection: "光と色",
    url: "https://en.wikipedia.org/wiki/Bedroom_in_Arles",
  },
  {
    id: "sunday",
    title: "グランド・ジャット島の日曜日の午後",
    creator: "ジョルジュ・スーラ",
    tags: ["光", "人物", "リズム"],
    description: "人物の間隔と点描の色。",
    notes:
      "構図｜立っている人物と座っている人物のリズム。\n質感｜小さな点の集まりが遠くから見ると混ざる。",
    collection: "構図の引き出し",
    url: "https://www.artic.edu/artworks/27992",
  },
];
export const sampleArtworks: Artwork[] = rows.map((row, index) => ({
  ...row,
  kind: "illustration",
  status: index === 2 ? "inbox" : "reviewing",
  favorite: index === 0,
  imageUrl: new URL(base + "samples/" + row.id + ".jpg", location.href).href,
  createdAt: new Date(Date.UTC(2026, 9, 7 - index)).toISOString(),
  updatedAt: new Date(Date.UTC(2026, 9, 7 - index)).toISOString(),
  createdBy: "sample",
  revision: 1,
  positionX: 60 + (index % 3) * 330,
  positionY: 60 + Math.floor(index / 3) * 330,
}));
export const sampleComments: Comment[] = [
  {
    id: "sample-comment",
    artworkId: "wave",
    body: "波の輪郭をなぞってみると、視線の流れが分かりやすい。",
    authorId: "sample",
    authorName: "サンプル",
    createdAt: "2026-10-07T01:00:00.000Z",
  },
];
