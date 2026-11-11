import express, {Request, Response} from "express";
import { error } from "node:console";
import { randomUUID } from "node:crypto"; //Para valores aleatorios
import { contarPrimos } from "./calculo";
import { Worker } from "node:worker_threads";
import path from "node:path"; 
import { medirLatencia, resumenMetricas } from "./metricas";

const PORT = Number(process.env.PORT ?? 3000);
const INVENTARIO_URL = process.env.INVENTARIO_URL ?? 'http://localhost:3001';
const TIMEOUT_MS = Number(process.env.TIMEOUT_MS ?? 2000);
const REPORTE_N = Number(process.env.REPORTE_N ?? 8_000_000);

interface Pedido {
    id: string;
    sku: string;
    cantidad: number;
    creadoEN: string;
}

const pedidos: Pedido[] = [];
const app = express();
app.use(express.json());
app.use(medirLatencia);

// Liveness: indica que el proceso de Pedidos sigue activo.
app.get('/health', (_req: Request, res: Response) => {
    res.status(200).send('OK');
});

// Readiness: Pedidos esta listo solo si Inventario responde a /health.
app.get('/health/ready', async (_req: Request, res: Response) => {
    const inicio = performance.now();
    try {
        const respuesta = await fetch(`${INVENTARIO_URL}/health`, {
            signal: AbortSignal.timeout(1000)
        });
        if (!respuesta.ok) {
            throw new Error(`Inventario respondió HTTP ${respuesta.status}`);
        }
        res.status(200).json({
            status: 'listo',
            inventario: 'ok',
            ms: Math.round(performance.now() - inicio)
        });
    } catch (error) {
        const e = error as Error & { cause?: { code?: string } };
        const motivo = e.name === 'TimeoutError'
            ? 'Tiempo de espera agotado (1000 ms)'
            : (e.cause?.code ?? e.message);
        res.status(503).json({
            status: 'no-listo',
            inventario: motivo,
            ms: Math.round(performance.now() - inicio)
        });
    }
});

app.get('/pedidos', (_req: Request, res: Response) => {
    res.status(200).json(pedidos);
});

app.post('/pedidos', async (req: Request, res: Response) => {
    const { sku, cantidad } = req.body ?? {};
    if (typeof sku !== 'string' || sku.trim().length === 0 ||
        typeof cantidad !== 'number' || !Number.isInteger(cantidad) || cantidad <= 0) {
        res.status(400).json({ error: 'Se requiere sku y cantidad entera mayor que 0' });
        return;
    }

    const inicio = performance.now();
    try {
        // Pedidos NO consulta /stock/:sku ni verifica cantidades.
        // Inventario toma esa decision y descuenta antes de responder.
        const respuesta = await fetch(
            `${INVENTARIO_URL}/stock/${encodeURIComponent(sku)}/reservar`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ cantidad }),
                signal: AbortSignal.timeout(3000)
            }
        );

        if (!respuesta.ok) {
            const detalle = await respuesta.json();
            // Propaga 409 y su detalle exacto; tambien otros errores de Inventario.
            res.status(respuesta.status).json(detalle);
            return;
        }

        const pedido: Pedido = {
            id: randomUUID(),
            sku,
            cantidad,
            creadoEN: new Date().toISOString()
        };
        pedidos.push(pedido);
        res.status(201).json(pedido);
    } catch (error) {
        const e = error as Error & { cause?: { code?: string } };
        const motivo = e.name === 'TimeoutError'
            ? 'Tiempo de espera agotado (3000 ms)'
            : (e.cause?.code ?? e.message);
        res.status(503).json({
            error: `Inventario no disponible: ${motivo}`,
            duracionMs: Math.round(performance.now() - inicio)
        });
    }
});

function leerN(req: Request):number{
    const n = Number(req.query.n ?? REPORTE_N);
    return Number.isInteger(n) && n>0 && n<=50_000_000 ? n : REPORTE_N;
};  

app.get("/reporte/bloqueante",(req: Request, res: Response)=>{
    const n= leerN(req);
    const inicio= performance.now();
    const primos= contarPrimos(n);
    const duracionMS=Math.round(performance.now()-inicio);
    res.json({modo:"bloqueando",n,primos,duracionMS});
});

/// con hilo worker
///importar libreria de worker y path

function contarPrimosenWorker(n:number): Promise<number>{
    return new Promise ((resolve,reject)=>{
        const archivo = path.join(__dirname, "worker-reporter.js");
        const w= new Worker(archivo, {workerData:{n}});
    w.once("message",(primos:number)=>resolve(primos));
    w.once("error", reject);
    });
};

app.get("/reporte/worker", async (req:Request, res: Response)=>{
    const n=leerN(req);
    const inicio= performance.now();
    const primos= await contarPrimosenWorker(n);
    const duracionMS=Math.round(performance.now()-inicio);
    res.json({modo:"worker",n,primos,duracionMS});
});

app.listen(PORT,()=>{
    console.log("servicio depedidos escuchando en el puerto: "+PORT+" inventario: "+INVENTARIO_URL+" timeout: "+TIMEOUT_MS+"ms")
});

app.get("/metricas", (_req: Request, res: Response) => {
    res.json(resumenMetricas());
});


