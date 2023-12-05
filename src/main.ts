import "leaflet/dist/leaflet.css";
import "./style.css";
import leaflet from "leaflet";
import luck from "./luck";
import "./leafletWorkaround";
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
  coinDisplay.innerHTML = ""; // Clear existing content
  coins.forEach((coin, index) => {
    const coinElement = document.createElement("div");
    coinElement.textContent = `Coin ${index + 1} at (${coin.cell.i}, ${
      coin.cell.j
    }), Serial: ${coin.serial}`;
    coinDisplay.appendChild(coinElement);
  });
}

let coinMap: Map<string, Coin[]> = new Map<string, Coin[]>();
const playerCoins: Coin[] = [];
const statusPanel = document.querySelector<HTMLDivElement>("#statusPanel")!;
statusPanel.innerHTML = "No points yet...";

function makePit(i: number, j: number) {
  const cell = board.getCellForPoint(
    leaflet.latLng({
      lat: MERRILL_CLASSROOM.lat + i * TILE_DEGREES,
      lng: MERRILL_CLASSROOM.lng + j * TILE_DEGREES,
    })
  );
  const bounds = board.getCellBounds(cell);
  const pit = leaflet.rectangle(bounds) as leaflet.Layer;

  const initialCoinCount = Math.floor(
    luck([i, j, "initialValue"].toString()) * 100
  );
  let coins: Coin[] = [];
  for (let serial = 0; serial < initialCoinCount; serial++) {
    coins.push(createCoin(cell.i, cell.j, serial));
  }
  coinMap.set(`${cell.i},${cell.j}`, coins);

  pit.bindPopup(() => {
    const container = document.createElement("div");
    let currentCount: Coin[] = coinMap.get(`${cell.i},${cell.j}`)!;
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
      let pitCoins = coinMap.get(`${cell.i},${cell.j}`);
      if (pitCoins && pitCoins.length > 0) {
        let coin: Coin | undefined = pitCoins.pop();
        if (coin !== undefined) {
          playerCoins.push(coin);
          container.querySelector<HTMLSpanElement>("#value")!.innerHTML =
            pitCoins.length.toString();
          statusPanel.innerHTML = `${playerCoins.length} points accumulated`;
          updateCoinDisplay(coinDisplay, pitCoins);
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
        let pitCoins = coinMap.get(`${cell.i},${cell.j}`) || [];
        pitCoins.push(coin);
        coinMap.set(`${cell.i},${cell.j}`, pitCoins);
        container.querySelector<HTMLSpanElement>("#value")!.innerHTML =
          pitCoins.length.toString();
        if (playerCoins.length == 0) statusPanel.innerHTML = `No points yet...`;
        else statusPanel.innerHTML = `${playerCoins.length} points accumulated`;
        updateCoinDisplay(coinDisplay, pitCoins);
      }
    });
    return container;
  });
  pit.addTo(map);
}

for (let i = -NEIGHBORHOOD_SIZE; i < NEIGHBORHOOD_SIZE; i++) {
  for (let j = -NEIGHBORHOOD_SIZE; j < NEIGHBORHOOD_SIZE; j++) {
    if (luck([i, j].toString()) < PIT_SPAWN_PROBABILITY) {
      makePit(i, j);
    }
  }
}
