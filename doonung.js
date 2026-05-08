const fs = require("fs");

const API = "https://api.doo-nang.com/graphql";
const TAKE = 60;

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

function posterToStream(url) {
  return url.replace("/poster.jpg", "/videos/1080p.m3u8");
}

function safeFilename(name) {
  return name.replace(/[<>:"/\\|?*]/g, "_");
}

async function main() {
  const menus = (await getMenus()).filter(
  menu =>
    !menu.title.includes("ซีรีย์") &&
    !menu.title.includes("ซีรีส์")
);

  let m3u = "#EXTM3U\n";

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

    if (category.groups.length) {
      const filename = `data/${safeFilename(menu.title)}.json`;

      fs.writeFileSync(
        filename,
        JSON.stringify(category, null, 2)
      );

      console.log("SAVED:", filename);
    }
  }

  fs.writeFileSync("playlist_doonung.m3u", m3u);

  console.log("DONE");
}

main().catch(console.error);