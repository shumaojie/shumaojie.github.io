const VERSION = "v4";
const SHELL_CACHE = "scale-shell-" + VERSION;
const TILE_CACHE = "scale-tiles-" + VERSION;
const CACHE_NAMES = [SHELL_CACHE, TILE_CACHE];
const APP_SHELL = ["./", "./index.html", "./sw.js", "./vendor/leaflet.css", "./vendor/leaflet.js"].map(resolveUrl);
const OFFLINE_TILE_URLS = getWarmTileUrls(30.2874, 120.1425, 16, 2);
const INDEX_FALLBACK = resolveUrl("./index.html");
const ROOT_FALLBACK = resolveUrl("./");

self.addEventListener("install", function (event) {
  event.waitUntil(
    Promise.all([
      precacheList(SHELL_CACHE, APP_SHELL, false),
      precacheList(TILE_CACHE, OFFLINE_TILE_URLS, true)
    ]).then(function () {
      return self.skipWaiting();
    })
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(keys.map(function (key) {
          if (CACHE_NAMES.indexOf(key) === -1) {
            return caches.delete(key);
          }
          return null;
        }));
      })
      .then(function () {
        return self.clients.claim();
      })
  );
});

self.addEventListener("fetch", function (event) {
  var request = event.request;
  var url;

  if (request.method !== "GET") {
    return;
  }

  url = new URL(request.url);

  if (request.mode === "navigate") {
    event.respondWith(handleNavigation(request));
    return;
  }

  if (url.origin === self.location.origin) {
    event.respondWith(cacheFirst(request, SHELL_CACHE, false));
    return;
  }

  if (isTileRequest(url)) {
    event.respondWith(cacheFirst(request, TILE_CACHE, true));
  }
});

function resolveUrl(path) {
  return new URL(path, self.location.href).toString();
}

function isTileRequest(url) {
  return url.hostname === "tile.openstreetmap.org" || /(^|\.)is\.autonavi\.com$/i.test(url.hostname);
}

function precacheList(cacheName, urls, allowOpaque) {
  return Promise.all(urls.map(function (url) {
    return fetchAndStore(cacheName, url, allowOpaque);
  }));
}

function fetchAndStore(cacheName, url, allowOpaque) {
  var init = allowOpaque ? { mode: "no-cors", cache: "reload" } : { cache: "reload" };

  return fetch(new Request(url, init))
    .then(function (response) {
      if (!response || (!response.ok && !(allowOpaque && response.type === "opaque"))) {
        return null;
      }

      return caches.open(cacheName).then(function (cache) {
        return cache.put(url, response.clone());
      });
    })
    .catch(function () {
      return null;
    });
}

function handleNavigation(request) {
  return fetch(request)
    .then(function (response) {
      var responseToCache;

      if (response && response.ok) {
        responseToCache = response.clone();
        caches.open(SHELL_CACHE).then(function (cache) {
          cache.put(request, responseToCache);
        });
      }
      return response;
    })
    .catch(function () {
      return caches.match(request)
        .then(function (cached) {
          return cached || caches.match(INDEX_FALLBACK);
        })
        .then(function (cached) {
          return cached || caches.match(ROOT_FALLBACK);
        });
    });
}

function cacheFirst(request, cacheName, allowOpaque) {
  return caches.match(request).then(function (cached) {
    if (cached) {
      return cached;
    }

    return fetch(request)
      .then(function (response) {
        var responseToCache;

        if (!response || (!response.ok && !(allowOpaque && response.type === "opaque"))) {
          return response;
        }

        responseToCache = response.clone();
        caches.open(cacheName).then(function (cache) {
          cache.put(request, responseToCache);
        });
        return response;
      })
      .catch(function () {
        return caches.match(request.url).then(function (fallback) {
          return fallback || Response.error();
        });
      });
  });
}

function getWarmTileUrls(lat, lng, zoom, radius) {
  var center = projectTile(lat, lng, zoom);
  var urls = [];
  var dx;
  var dy;

  for (dx = -radius; dx <= radius; dx += 1) {
    for (dy = -radius; dy <= radius; dy += 1) {
      urls.push("https://tile.openstreetmap.org/" + zoom + "/" + (center.x + dx) + "/" + (center.y + dy) + ".png");
    }
  }

  return urls;
}

function projectTile(lat, lng, zoom) {
  var scale = Math.pow(2, zoom);
  var latitude = lat * Math.PI / 180;
  var x = Math.floor(((lng + 180) / 360) * scale);
  var y = Math.floor((1 - Math.log(Math.tan(latitude) + 1 / Math.cos(latitude)) / Math.PI) / 2 * scale);

  return { x: x, y: y };
}
