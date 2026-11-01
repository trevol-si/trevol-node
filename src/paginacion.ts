// Paginación con iteradores (docs/api/43 §2.6.7): la API pagina por cursor (`starting_after`).

/** Lo mínimo que tiene una página de cualquier listado de la API. */
export interface Pagina<T> {
	data?: T[];
	has_more?: boolean;
	next_cursor?: string | null;
}

/**
 * Recorre todas las páginas de un listado, perezosamente. `pagina(cursor)` pide UNA página (`startingAfter: cursor`; `undefined` la
 * primera). Sigue con `next_cursor` mientras `has_more`; si la página no lo trae, usa el `id` del último elemento (así lo arma la API).
 * Se detiene si el cursor no avanza (una API que repitiera el mismo cursor no puede dejar el bucle girando para siempre).
 */
export async function* paginar<T extends { id?: string }>(pagina: (cursor: string | undefined) => Promise<Pagina<T>>): AsyncGenerator<T, void, undefined> {
	let cursor: string | undefined;
	for (;;) {
		const p = await pagina(cursor);
		const datos = p.data ?? [];
		for (const x of datos) yield x;
		if (!p.has_more || datos.length === 0) return;
		const siguiente = p.next_cursor ?? datos[datos.length - 1]?.id ?? undefined;
		if (!siguiente || siguiente === cursor) return;
		cursor = siguiente;
	}
}
