const fs = require("fs");

const API = "https://api.doo-nang.com/graphql";
const TAKE = 60;
const WISEPLAY_DIR = "wiseplay";
const now = new Date(
  new Date().toLocaleString("en-US", { timeZone: "Asia/Bangkok" })
);

const DATE = `${now.getDate()}/${now.getMonth() + 1}/${now.getFullYear() + 543}`;

if (!fs.existsSync("data")) {
  fs.mkdirSync("data");
}

async function fetchGraphQL(query, variables = {}) {
  const url =
    `${API}?query=${encodeURIComponent(query)}` +
    `&variables=${encodeURIComponent(JSON.stringify(variables))}`;

  const res = await fetch(url, {
    headers: {
      referer: "https://www.doo-nang.com/",
      origin: "https://www.doo-nang.com",
      "user-agent": "Mozilla/5.0"
    }
  });

  return res.json();
}

async function getMenus() {
  const query = `
    query {
      movieMenus(orderBy:[{ordinal:{sort:asc}}]) {
        title
        linkType
        value
      }
    }
  `;

  const data = await fetchGraphQL(query);
  return data?.data?.movieMenus || [];
}

async function getMovies(menu, skip) {
  const query = `
    query getMovies($skip:Int!,$take:Int!,$where:MovieWhereInput){
      movies(skip:$skip,take:$take,where:$where,orderBy:{createdAt:desc}) {
        items {
          id
          titleTh
          titleEn
          posterUrl
          imdbRating
        }
      }
    }
  `;

  let variables = {
    skip,
    take: TAKE
  };

  if (menu.linkType === "movie-tag") {
    variables.where = {
      tags: {
        some: {
          tag: {
            name: {
              equals: String(menu.value).trim()
            }
          }
        }
      }
    };
  }

  else if (menu.linkType === "movie-genre") {
    variables.where = {
      genres: {
        some: {
          genre: {
            name: {
              equals: String(menu.value).trim()
            }
          }
        }
      }
    };
  }

  return fetchGraphQL(query, variables);
}

function posterToStream(posterUrl) {
  const match = posterUrl.match(
    /duckduckcdn\.com\/([^/]+)\//
  );

  if (!match) return "";

  const id = match[1];

  return `https://api.doo-nang.com/video/${id}/playlist.m3u8`;
}

function safeFilename(name) {
  return name.replace(/[<>:"/\\|?*]/g, "_");
}

function generateIndex(categories) {
  const baseRaw =
    "https://raw.githubusercontent.com/Hssmnoy/D-N/main/wiseplay/";

  const banner =
    "https://s3.ดูบอลดูหนัง.com/global/banners/block-8a87dca3-0b6c-4b84-aad7-d2f392aef5da.jpeg";

  const index = {
    name: "Doo-Nang",
    author: `อัพเดตล่าสุด ${DATE}`,
    image: banner,
    url: "https://www.doo-nang.com/",
    groups: []
  };

  categories.forEach(category => {
    index.groups.push({
      name: category.name,
      image: category.image || banner,
      url: `${baseRaw}${encodeURIComponent(
        safeFilename(category.name)
      )}.json`
    });
  });

  fs.writeFileSync(
    "data/index.json",
    JSON.stringify(index, null, 2)
  );

  console.log("📦 data/index.json created");
}

function buildWiseplay(category) {

  const today = `อัพเดตล่าสุด ${DATE}`;

  const output = {
    name: category.name,
    author: today,
    image: category.image,
    url: category.url,
    groups: []
  };

  for (const movie of category.groups) {

    output.groups.push({
      name: movie.name,
      image: movie.image,
      info: movie.info,
      stations: [
        {
          name: movie.name,
          image: movie.image,
          url: movie.url,
          referer: movie.referer
        }
      ]
    });

  }

  const file = `${WISEPLAY_DIR}/${safeFilename(category.name)}.json`;

  fs.writeFileSync(file, JSON.stringify(output, null, 2));

  console.log("📺 Wiseplay saved:", file);
}


async function main() {
  const menus = (await getMenus()).filter(
  menu =>
    !menu.title.includes("ซีรีย์") &&
    !menu.title.includes("ซีรีส์")
);

  let m3u = "#EXTM3U\n";
  let savedCategories = [];

  for (const menu of menus) {
    console.log("MENU:", menu.title);

    let category = {
  	name: menu.title,
  	author: `อัพเดตล่าสุด ${DATE}`,
  	image: "https://s3.ดูบอลดูหนัง.com/global/banners/block-8a87dca3-0b6c-4b84-aad7-d2f392aef5da.jpeg",
  	url: "https://www.doo-nang.com",
  	groups: []
      };

    let skip = 0;

    while (true) {
      const data = await getMovies(menu, skip);
      const movies = data?.data?.movies?.items || [];

      if (!movies.length) break;

      for (const movie of movies) {
        if (!movie.posterUrl) continue;

        const title = movie.titleTh || movie.titleEn;
        const stream = posterToStream(movie.posterUrl);

        if (!category.image) {
          category.image = movie.posterUrl;
        }

        category.groups.push({
          name: title,
          info: `IMDb ${movie.imdbRating || "-"}`,
          image: movie.posterUrl,
          url: stream,
          referer: "https://www.doo-nang.com"
        });

        m3u += `#EXTINF:-1 tvg-logo="${movie.posterUrl}" group-title="${menu.title}",${title}\n`;
        m3u += `${stream}\n`;
      }

      skip += TAKE;
    }

// 🔥 สร้าง folder ก่อน (ถูกต้องแล้ว)
if (!fs.existsSync(WISEPLAY_DIR)) {
  fs.mkdirSync(WISEPLAY_DIR);
}

if (category.groups.length) {

  const filename = `data/${safeFilename(menu.title)}.json`;

  // 1️⃣ บันทึกไฟล์เก่า (JSON เดิม)
  fs.writeFileSync(
    filename,
    JSON.stringify(category, null, 2)
  );

  // 2️⃣ 🔥 แปลงเป็น Wiseplay (ต้องใช้ object เดียวกัน)
  buildWiseplay({
    name: category.name,
    image: category.image,
    url: category.url,
    groups: category.groups
  });

  // 3️⃣ เก็บไว้ทำ index
  savedCategories.push(category);

  console.log("SAVED:", filename);
}
}
} 
main().catch(console.error);
