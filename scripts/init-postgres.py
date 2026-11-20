from settings import ROOT
from db.conexion import inicializar_base

if __name__ == "__main__":
    inicializar_base()
    print("Esquemas de PostgreSQL preparados.")
