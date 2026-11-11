import express, { Request, Response } from 'express';

const PORT = Number(process.env.PORT ?? 3001);
const RETARDO_MS = Number(process.env.RETARDO_MS ?? 0);

// Se conservan los productos de clase y se agrega el SKU de la actividad.
const stock = new Map<string, number>([
    ['Secadora', 5],
    ['Lavadora', 40],
    ['Refrigerador', 12],
    ['Microondas', 0],
    ['MOUSE-USB', 40]
]);

const esperar = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
const app = express();
app.use(express.json());

// Liveness del servicio Inventario.
app.get('/health', (_req: Request, res: Response) => {
    res.status(200).send('OK');
});

app.get('/stock/:sku', async (req: Request<{ sku: string }>, res: Response) => {
    if (RETARDO_MS > 0) await esperar(RETARDO_MS);
    const disponible = stock.get(req.params.sku);
    if (disponible === undefined) {
        res.status(404).json({ error: `El producto con SKU ${req.params.sku} no existe` });
        return;
    }
    res.status(200).json({ sku: req.params.sku, disponible });
});

// La reserva valida, espera, comprueba stock actualizado y descuenta.
app.post('/stock/:sku/reservar', async (req: Request<{ sku: string }>, res: Response) => {
    const { sku } = req.params;
    const cantidad: unknown = req.body?.cantidad;

    if (typeof cantidad !== 'number' || !Number.isInteger(cantidad) || cantidad <= 0) {
        res.status(400).json({ error: 'cantidad debe ser un entero mayor que 0' });
        return;
    }

    if (!stock.has(sku)) {
        res.status(404).json({ error: `El producto con SKU ${sku} no existe` });
        return;
    }

    // Retardo antes del descuento. Se consulta el stock DESPUES de esperar
    // para que dos reservas concurrentes no usen un dato antiguo.
    if (RETARDO_MS > 0) await esperar(RETARDO_MS);
    const disponible = stock.get(sku)!;
    if (cantidad > disponible) {
        res.status(409).json({
            error: 'Stock insuficiente',
            sku,
            solicitado: cantidad,
            disponible
        });
        return;
    }

    const restante = disponible - cantidad;
    stock.set(sku, restante);
    res.status(200).json({ sku, reservado: cantidad, restante });
});

app.listen(PORT, () => {
    console.log(`Inventario en puerto ${PORT}; retardo ${RETARDO_MS} ms`);
});
