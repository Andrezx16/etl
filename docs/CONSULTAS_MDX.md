# Consultas MDX

| ID | Vista |
|---|---|
| S1 | Número de programas y costo promedio por sector |
| S2 | Programas registrados por año |
| S3 | Programas de pregrado y créditos por campo amplio |
| C1 | Alta calidad por departamento |
| C2 | Instituciones con oferta en Nariño sobre el promedio nacional de su sector |
| C3 | Registros, promedio móvil y crecimiento, intervalo 2013–2026 |

Los archivos originales están en `mdx/`. Las consultas se extraen conservando sus expresiones, miembros calculados y restricciones. Las selecciones de filas actúan sobre la respuesta del gráfico. S2 permite solicitar el desglose mensual del año seleccionado mediante la jerarquía de tiempo del cubo. Las consultas avanzadas permiten combinar hasta dos dimensiones y tres medidas de una lista autorizada. Exportación y tabla operan sobre un snapshot común y aplican los mismos filtros de vista.