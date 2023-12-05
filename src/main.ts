import "leaflet/dist/leaflet.css";
import "./style.css";
import leaflet from "leaflet";
import luck from "./luck";
import "./leafletWorkaround";
import L from "leaflet";
import { Board } from "./board";
import { Cell } from "./board";

const MERRILL_CLASSROOM = leaflet.latLng({
  lat: 36.9995,
  lng: -122.0533,
});

const GAMEPLAY_ZOOM_LEVEL = 19;
const TILE_DEGREES = 1e-4;
const NEIGHBORHOOD_SIZE = 8;
const PIT_SPAWN_PROBABILITY = 0.1;
const MOVE_STEP = TILE_DEGREES * 2;

const mapContainer = document.querySelector<HTMLElement>("#map")!;

const map = leaflet.map(mapContainer, {
  center: MERRILL_CLASSROOM,
  zoom: GAMEPLAY_ZOOM_LEVEL,
  minZoom: GAMEPLAY_ZOOM_LEVEL,
  maxZoom: GAMEPLAY_ZOOM_LEVEL,
  zoomControl: false,
  scrollWheelZoom: false,
});

leaflet
  .tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution:
      '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  })
  .addTo(map);

const board = new Board(TILE_DEGREES, NEIGHBORHOOD_SIZE);
const playerMarker = leaflet.marker(MERRILL_CLASSROOM);
playerMarker.bindTooltip("That's you!");
playerMarker.addTo(map);

const sensorButton = document.querySelector("#sensor")!;
sensorButton.addEventListener("click", () => {
  navigator.geolocation.watchPosition((position) => {
    playerMarker.setLatLng(
      leaflet.latLng(position.coords.latitude, position.coords.longitude)
    );
    map.setView(playerMarker.getLatLng());
  });
});

interface Coin {
  cell: Cell;
  serial: number;
}

function createCoin(i: number, j: number, serial: number) {
  const cell = { i: i, j: j };
  return { cell, serial };
}

function updateCoinDisplay(coinDisplay: HTMLDivElement, coins: Coin[]) {
  coinDisplay.innerHTML = "";
  coins.forEach((coin, index) => {
    const coinElement = document.createElement("div");
    coinElement.textContent = `Coin ${index + 1} at (${coin.cell.i}, ${
      coin.cell.j
    }), Serial: ${coin.serial}`;
    coinDisplay.appendChild(coinElement);
  });
}

let geocacheMap: Map<string, Geocache> = new Map<string, Geocache>();
const playerCoins: Coin[] = [];
const statusPanel = document.querySelector<HTMLDivElement>("#statusPanel")!;
statusPanel.innerHTML = "No points yet...";

interface Momento<T> {
  toMomento(): T;
  fromMomento(momento: T): void;
}

class Geocache implements Momento<string> {
  i: number;
  j: number;
  coins: Coin[];
  constructor(i: number, j: number, coins: Coin[]) {
    this.i = i;
    this.j = j;
    this.coins = coins;
  }
  toMomento() {
    return JSON.stringify({ i: this.i, j: this.j, coins: this.coins });
  }

  fromMomento(momento: string) {
    let data = JSON.parse(momento);
    this.i = data.i;
    this.j = data.j;
    this.coins = data.coins;
  }
}

let geocaches: Geocache[] = [];

function saveGeocacheStates() {
  geocaches.map((geocache) => geocache.toMomento());
}

function makePit(i: number, j: number) {
  const cell = board.getCellForPoint(
    leaflet.latLng({
      lat: MERRILL_CLASSROOM.lat + i * TILE_DEGREES,
      lng: MERRILL_CLASSROOM.lng + j * TILE_DEGREES,
    })
  );
  const bounds = board.getCellBounds(cell);
  const pit = leaflet.rectangle(bounds) as leaflet.Layer;

  if (!geocacheMap.has(`${cell.i},${cell.j}`)) {
    const initialCoinCount = Math.floor(
      luck([i, j, "initialValue"].toString()) * 100
    );
    let coins: Coin[] = [];
    for (let serial = 0; serial < initialCoinCount; serial++) {
      coins.push(createCoin(cell.i, cell.j, serial));
    }
    const geocache = new Geocache(cell.i, cell.j, coins);
    geocacheMap.set(`${cell.i},${cell.j}`, geocache);
    const newGeo = new Geocache(cell.i, cell.j, coins);
    geocaches.push(newGeo);
  }

  pit.bindPopup(() => {
    const container = document.createElement("div");
    let geocache = geocacheMap.get(`${cell.i},${cell.j}`);
    let currentCount: Coin[] = geocache ? geocache.coins : [];
    container.innerHTML = `
                <div>There is a pit here at "${cell.i},${cell.j}". It has value <span id="value">${currentCount.length}</span>.</div>
                <div class="coinDisplay" style="height: 100px; overflow-y: scroll;"></div>
                <button id="poke">poke</button>
                <button id="deposit">deposit</button>`;

    const coinDisplay =
      container.querySelector<HTMLDivElement>(".coinDisplay")!;
    updateCoinDisplay(coinDisplay, currentCount);

    const poke = container.querySelector<HTMLButtonElement>("#poke")!;
    poke.addEventListener("click", () => {
      if (geocache && geocache.coins.length > 0) {
        let coin: Coin | undefined = geocache.coins.pop();
        if (coin !== undefined) {
          playerCoins.push(coin);
          container.querySelector<HTMLSpanElement>("#value")!.innerHTML =
            geocache.coins.length.toString();
          statusPanel.innerHTML = `${playerCoins.length} points accumulated`;
          updateCoinDisplay(coinDisplay, geocache.coins);
        }
      } else {
        alert("There no more coin to poked from this pit.");
        return;
      }
    });

    const deposit = container.querySelector<HTMLButtonElement>("#deposit")!;
    deposit.addEventListener("click", () => {
      if (playerCoins.length <= 0) return;
      let coin: Coin | undefined = playerCoins.pop();
      if (coin !== undefined) {
        if (!geocache) {
          geocache = new Geocache(cell.i, cell.j, []);
          geocacheMap.set(`${cell.i},${cell.j}`, geocache);
        }
        geocache.coins.push(coin);
        container.querySelector<HTMLSpanElement>("#value")!.innerHTML =
          geocache.coins.length.toString();
        if (playerCoins.length == 0) statusPanel.innerHTML = `No points yet...`;
        else statusPanel.innerHTML = `${playerCoins.length} points accumulated`;
        updateCoinDisplay(coinDisplay, geocache.coins);
      }
    });
    return container;
  });
  pit.addTo(map);
}

function regenerateCaches() {
  map.eachLayer((layer) => {
    if (layer !== playerMarker && !(layer instanceof L.TileLayer)) {
      map.removeLayer(layer);
    }
  });

  const playerPos = playerMarker.getLatLng();
  const iStart =
    Math.floor((playerPos.lat - MERRILL_CLASSROOM.lat) / TILE_DEGREES) -
    NEIGHBORHOOD_SIZE;
  const jStart =
    Math.floor((playerPos.lng - MERRILL_CLASSROOM.lng) / TILE_DEGREES) -
    NEIGHBORHOOD_SIZE;

  for (let i = iStart; i < iStart + NEIGHBORHOOD_SIZE * 2; i++) {
    for (let j = jStart; j < jStart + NEIGHBORHOOD_SIZE * 2; j++) {
      if (luck([i, j].toString()) < PIT_SPAWN_PROBABILITY) {
        makePit(i, j);
      }
    }
  }
}

function movePlayer(latChange: number, lngChange: number) {
  saveGeocacheStates();
  const currentPos = playerMarker.getLatLng();
  const newPos = leaflet.latLng(
    currentPos.lat + latChange,
    currentPos.lng + lngChange
  );
  playerMarker.setLatLng(newPos);
  map.setView(newPos);
  regenerateCaches();
}

document
  .getElementById("north")!
  .addEventListener("click", () => movePlayer(MOVE_STEP, 0));
document
  .getElementById("south")!
  .addEventListener("click", () => movePlayer(-MOVE_STEP, 0));
document
  .getElementById("east")!
  .addEventListener("click", () => movePlayer(0, MOVE_STEP));
document
  .getElementById("west")!
  .addEventListener("click", () => movePlayer(0, -MOVE_STEP));

for (let i = -NEIGHBORHOOD_SIZE; i < NEIGHBORHOOD_SIZE; i++) {
  for (let j = -NEIGHBORHOOD_SIZE; j < NEIGHBORHOOD_SIZE; j++) {
    if (luck([i, j].toString()) < PIT_SPAWN_PROBABILITY) {
      makePit(i, j);
    }
  }
}
