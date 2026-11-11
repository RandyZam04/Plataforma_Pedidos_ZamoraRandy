
// Interceptor que mide cada petición (tarea en clase).
import { Request, Response, NextFunction } from "express";

const UMBRAL_LENTA_MS = Number(process.env.UMBRAL_LENTA_MS ?? 1000);

interface Estadistica {
  peticiones: number;
  totalMs: number;
  maxMs: number;
  lentas: number;
}

const porRuta = new Map<string, Estadistica>();

export function medirLatencia(req: Request, res: Response, next: NextFunction): void {
  const inicio = performance.now();

  res.on("finish", () => {
    // TODO 1: calcula la duración en ms
    const duracionMs = performance.now() - inicio;

    // TODO 2: busca la estadística de la ruta (créala si no existe)
    const ruta = `${req.method} ${req.path}`;

    let estadistica = porRuta.get(ruta);

    if (!estadistica) {
      estadistica = {
        peticiones: 0,
        totalMs: 0,
        maxMs: 0,
        lentas: 0
      };
      porRuta.set(ruta, estadistica);
    }

    // TODO 3: actualiza las estadísticas
    estadistica.peticiones++;
    estadistica.totalMs += duracionMs;
    estadistica.maxMs = Math.max(estadistica.maxMs, duracionMs);

    if (duracionMs > UMBRAL_LENTA_MS) {
      estadistica.lentas++;
    }
  });

  next();
}

export function resumenMetricas() {
  // TODO 4: devuelve el resumen de métricas
  return {
    umbralLentaMs: UMBRAL_LENTA_MS,
    rutas: Array.from(porRuta.entries()).map(([ruta, estadistica]) => ({
      ruta,
      peticiones: estadistica.peticiones,
      promedioMs: estadistica.totalMs / estadistica.peticiones,
      maxMs: estadistica.maxMs,
      lentas: estadistica.lentas
    }))
  };
}
