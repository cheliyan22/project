/** Normalize text before embedding it in a PostgREST OR/ILIKE expression. */
export const forLike=(raw:string)=>raw.replace(/[,%()*"\\]/g,' ').trim().replace(/\s+/g,' ');
