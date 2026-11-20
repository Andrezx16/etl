-- ============================================================
-- 05_dw_sqlserver.sql
-- Réplica del esquema dw (Postgres) en SQL Server, para que SSAS
-- construya el cubo multidimensional sobre ella.
-- Ejecutar en SSMS conectado al Database Engine (localhost).
--
-- Notas de diseño:
--  * Las llaves sk_* NO son IDENTITY: se copian con el mismo valor que
--    tienen en Postgres para no romper las llaves foráneas del hecho.
--  * TEXT de Postgres se pasa a NVARCHAR(n) con tamaño fijo. SSAS no
--    se lleva bien con NVARCHAR(MAX) como llave de atributos.
--  * Este script no borra nada: cada tabla se crea solo si no existe.
--    Si al copiar aparece "String or binary data would be truncated",
--    amplía el tamaño de esa columna con ALTER TABLE ... ALTER COLUMN.
-- ============================================================

IF DB_ID(N'bodega_snies') IS NULL
    CREATE DATABASE bodega_snies;
GO

USE bodega_snies;
GO

IF SCHEMA_ID(N'dw') IS NULL
    EXEC(N'CREATE SCHEMA dw');
GO

-- ------------------------------------------------------------
-- DIMENSIONES
-- ------------------------------------------------------------
IF OBJECT_ID(N'dw.dim_institucion', N'U') IS NULL
CREATE TABLE dw.dim_institucion (
    sk_institucion         INT           NOT NULL PRIMARY KEY,
    codigo_institucion     NVARCHAR(50)  NOT NULL,
    codigo_ies_padre       NVARCHAR(50)  NULL,
    nombre                 NVARCHAR(400) NOT NULL,
    estado                 NVARCHAR(100) NULL,
    nit                    NVARCHAR(50)  NULL,
    principal_seccional    NVARCHAR(100) NULL,
    naturaleza_juridica    NVARCHAR(200) NULL,
    sector                 NVARCHAR(100) NULL,
    caracter_academico     NVARCHAR(200) NULL,
    pagina_web             NVARCHAR(500) NULL,
    acreditacion           NVARCHAR(50)  NULL,
    fecha_acreditacion     DATE          NULL,
    vigencia_acreditacion  INT           NULL,
    directivo_actual       NVARCHAR(400) NULL,
    CONSTRAINT uq_dim_institucion_codigo UNIQUE (codigo_institucion)
);
GO

IF OBJECT_ID(N'dw.dim_ubicacion', N'U') IS NULL
CREATE TABLE dw.dim_ubicacion (
    sk_ubicacion    INT           NOT NULL PRIMARY KEY,
    departamento    NVARCHAR(200) NOT NULL,
    municipio       NVARCHAR(200) NOT NULL,
    tipo_cobertura  NVARCHAR(200) NOT NULL
);
GO

IF OBJECT_ID(N'dw.dim_area_conocimiento', N'U') IS NULL
CREATE TABLE dw.dim_area_conocimiento (
    sk_area_conocimiento  INT           NOT NULL PRIMARY KEY,
    area_conocimiento     NVARCHAR(200) NOT NULL,
    nbc                   NVARCHAR(200) NOT NULL,
    cine_f_amplio         NVARCHAR(200) NOT NULL,
    cine_f_especifico     NVARCHAR(200) NOT NULL,
    cine_f_detallado      NVARCHAR(200) NOT NULL
);
GO

IF OBJECT_ID(N'dw.dim_modalidad', N'U') IS NULL
CREATE TABLE dw.dim_modalidad (
    sk_modalidad             INT           NOT NULL PRIMARY KEY,
    nivel_academico          NVARCHAR(100) NOT NULL,
    nivel_formacion          NVARCHAR(100) NOT NULL,
    modalidad                NVARCHAR(100) NOT NULL,
    periodicidad             NVARCHAR(100) NOT NULL,
    periodicidad_admisiones  NVARCHAR(100) NOT NULL,
    ciclos_propedeuticos     NVARCHAR(50)  NOT NULL
);
GO

IF OBJECT_ID(N'dw.dim_estado_calidad', N'U') IS NULL
CREATE TABLE dw.dim_estado_calidad (
    sk_estado_calidad          INT           NOT NULL PRIMARY KEY,
    estado_programa            NVARCHAR(100) NOT NULL,
    reconocimiento_ministerio  NVARCHAR(200) NOT NULL
);
GO

IF OBJECT_ID(N'dw.dim_tiempo', N'U') IS NULL
CREATE TABLE dw.dim_tiempo (
    sk_tiempo   INT          NOT NULL PRIMARY KEY,
    fecha       DATE         NOT NULL,
    anio        INT          NOT NULL,
    trimestre   INT          NOT NULL,
    mes         INT          NOT NULL,
    dia_semana  NVARCHAR(50) NOT NULL,
    CONSTRAINT uq_dim_tiempo_fecha UNIQUE (fecha)
);
GO

IF OBJECT_ID(N'dw.dim_programa', N'U') IS NULL
CREATE TABLE dw.dim_programa (
    sk_programa            INT           NOT NULL PRIMARY KEY,
    codigo_snies           NVARCHAR(50)  NOT NULL,
    codigo_icfes           NVARCHAR(50)  NULL,
    registro_unico         NVARCHAR(100) NULL,
    nombre_programa        NVARCHAR(400) NOT NULL,
    titulo_otorgado        NVARCHAR(400) NULL,
    resolucion_aprobacion  NVARCHAR(200) NULL,
    CONSTRAINT uq_dim_programa_snies UNIQUE (codigo_snies)
);
GO

-- ------------------------------------------------------------
-- HECHO (grano: un programa académico)
-- ------------------------------------------------------------
IF OBJECT_ID(N'dw.hecho_oferta_programa', N'U') IS NULL
CREATE TABLE dw.hecho_oferta_programa (
    sk_hecho                  BIGINT        NOT NULL PRIMARY KEY,
    sk_institucion            INT           NOT NULL REFERENCES dw.dim_institucion(sk_institucion),
    sk_ubicacion              INT           NOT NULL REFERENCES dw.dim_ubicacion(sk_ubicacion),
    sk_area_conocimiento      INT           NOT NULL REFERENCES dw.dim_area_conocimiento(sk_area_conocimiento),
    sk_modalidad              INT           NOT NULL REFERENCES dw.dim_modalidad(sk_modalidad),
    sk_programa               INT           NOT NULL REFERENCES dw.dim_programa(sk_programa),
    sk_estado_calidad         INT           NOT NULL REFERENCES dw.dim_estado_calidad(sk_estado_calidad),
    sk_tiempo_resolucion      INT           NULL REFERENCES dw.dim_tiempo(sk_tiempo),
    sk_tiempo_ejecutoria      INT           NULL REFERENCES dw.dim_tiempo(sk_tiempo),
    sk_tiempo_registro_snies  INT           NULL REFERENCES dw.dim_tiempo(sk_tiempo),
    indicador_oferta          SMALLINT      NOT NULL DEFAULT 1,
    creditos                  INT           NULL,
    duracion_periodos         INT           NULL,
    vigencia_anios            DECIMAL(4,1)  NULL,
    costo_matricula           DECIMAL(12,2) NULL,
    CONSTRAINT uq_hecho_programa UNIQUE (sk_programa)
);
GO

-- ------------------------------------------------------------
-- VISTAS PARA EL CUBO
-- Agregan columnas "llave compuesta" para que las jerarquías no
-- mezclen miembros con el mismo nombre en padres distintos:
--   * trimestre 1 del 2020 vs trimestre 1 del 2021
--   * municipios con el mismo nombre en departamentos distintos
-- En SSAS: KeyColumns = columna "clave_*", NameColumn = la columna simple.
-- ------------------------------------------------------------
CREATE OR ALTER VIEW dw.v_dim_tiempo AS
SELECT
    sk_tiempo,
    fecha,
    anio,
    trimestre,
    mes,
    dia_semana,
    anio * 10 + trimestre  AS clave_anio_trimestre,   -- ej. 20203
    anio * 100 + mes       AS clave_anio_mes          -- ej. 202007
FROM dw.dim_tiempo;
GO

CREATE OR ALTER VIEW dw.v_dim_ubicacion AS
SELECT
    sk_ubicacion,
    departamento,
    municipio,
    tipo_cobertura,
    CONCAT(departamento, N'|', municipio) AS clave_municipio
FROM dw.dim_ubicacion;
GO

CREATE OR ALTER VIEW dw.v_dim_area_conocimiento AS
SELECT
    sk_area_conocimiento,
    area_conocimiento,
    nbc,
    cine_f_amplio,
    cine_f_especifico,
    cine_f_detallado,
    CONCAT(area_conocimiento, N'|', nbc)                                   AS clave_nbc,
    CONCAT(cine_f_amplio, N'|', cine_f_especifico)                         AS clave_cine_especifico,
    CONCAT(cine_f_amplio, N'|', cine_f_especifico, N'|', cine_f_detallado) AS clave_cine_detallado
FROM dw.dim_area_conocimiento;
GO

CREATE OR ALTER VIEW dw.v_dim_modalidad AS
SELECT
    sk_modalidad,
    nivel_academico,
    nivel_formacion,
    modalidad,
    periodicidad,
    periodicidad_admisiones,
    ciclos_propedeuticos,
    CONCAT(nivel_academico, N'|', nivel_formacion) AS clave_nivel_formacion
FROM dw.dim_modalidad;
GO
