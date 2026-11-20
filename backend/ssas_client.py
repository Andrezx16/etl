import httpx
from settings import SSAS_URL, SECRET

class CubeError(RuntimeError):
    pass

def call(method, endpoint, payload=None):
    if not SECRET:
        raise CubeError("Configura MERCURY_SERVICE_KEY y el servicio SSAS.")
    try:
        response = httpx.request(method, SSAS_URL + "/internal/" + endpoint, json=payload,
                                 headers={"X-Mercury-Key": SECRET}, timeout=40)
        response.raise_for_status()
        return response.json()
    except (httpx.HTTPError, ValueError) as exc:
        raise CubeError("SSAS no respondió correctamente. Revisa el servicio, la instancia y el cubo.") from exc
