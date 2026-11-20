# Modelo de datos

El hecho `dw.hecho_oferta_programa` representa una fila por programa identificado por `dim_programa.codigo_snies`. `sk_programa` es estable en el UPSERT y es la clave de sincronización del hecho. `sk_hecho` es la clave primaria física. La institución se identifica por `codigo_institucion` y el tiempo por `fecha`.

Las dimensiones de ubicación, modalidad, área CINE y calidad conservan su combinación de atributos única definida en `backend/db/sql/ddl_dw.sql`. El hecho tiene tres relaciones con tiempo, para resolución, ejecutoria y registro SNIES. El DSV usa el esquema de `warehouse/05_dw_sqlserver.sql`.

Las claves de staging se describen en `/api/sources/schema`. Instituciones usa código IES, programas código SNIES, cobertura utiliza programa, departamento, municipio y tipo, y directivos utiliza IES, cargo, nombre, apellido y fecha inicial.