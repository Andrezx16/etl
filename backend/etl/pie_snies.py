def es_nota_snies(valores):
    """Identifica el pie de los reportes SNIES por su marca y su texto fijo."""
    if len(valores) < 2:
        return False
    marca, texto = valores[:2]
    return (
        isinstance(marca, str)
        and marca.strip().casefold() == "nota:"
        and isinstance(texto, str)
        and texto.strip().casefold().startswith("la información del presente reporte corresponde")
        and all(valor is None or not str(valor).strip() for valor in valores[2:])
    )
