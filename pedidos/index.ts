import express, { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';

const PORT = Number(process.env.PORT ?? 3000);
const INVENTARIO_URL = process.env.INVENTARIO_URL ?? 'http://localhost:3001';

interface Pedido {
    id: string;
    sku: string;
    cantidad: number;
    creadoEN: string;
}

const pedidos: Pedido[] = [];
const app = express();
app.use(express.json());

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

app.listen(PORT, () => {
    console.log(`Pedidos en puerto ${PORT}`);
});
