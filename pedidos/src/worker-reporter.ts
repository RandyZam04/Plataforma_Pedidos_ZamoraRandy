import { parentPort, workerData } from "node:worker_threads";
import { contarPrimos } from "./calculo";

const {n} = workerData as {n: number};
parentPort?.postMessage(contarPrimos(n));