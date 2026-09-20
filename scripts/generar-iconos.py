#!/usr/bin/env python3
"""Genera los iconos de la app (pestaña, iOS y Android) a partir de escudo-9a.png.

Uso, desde la raíz del repo:  python3 scripts/generar-iconos.py   (requiere Pillow)

Los iconos son un recorte del escudo con el 9, NO el logo completo: a 16-64 px los
laureles, el sol y el listón se disuelven y solo el escudo se lee. Todo se deriva
píxel a píxel del original; no se redibuja nada.

Salida:
  favicon.ico              16, 32 y 48 px (pestaña del navegador)
  apple-touch-icon.png     180x180, opaco (iOS pinta de negro lo transparente)
  icons/icon-192.png       Android/PWA, propósito "any"
  icons/icon-512.png
  icons/icon-maskable-192.png   logo al 72 % del lienzo, fondo a sangre completa
  icons/icon-maskable-512.png
"""
import struct
from io import BytesIO
from pathlib import Path

from PIL import Image

RAIZ = Path(__file__).resolve().parent.parent
ORIGEN = RAIZ / "escudo-9a.png"

# Escudo dentro del original (512x584): medido como la caja del rojo oscuro sobre y=470,
# que deja fuera el texto del listón. Más 6 px de aire para que no quede pegado al borde.
ESCUDO = (127 - 6, 160 - 6, 381 + 7, 447 + 7)
FONDO = (254, 254, 254)  # el "blanco" real del original; así el lienzo no deja costura

FRACCION_FAVICON = 0.94   # pestaña: lo más grande posible
FRACCION_ANY = 0.86       # iOS y Android "any": algo de aire
FRACCION_MASKABLE = 0.72  # Android recorta hasta un círculo: contenido en el centro


def lienzo(logo, lado, fraccion):
    """Centra el logo en un cuadrado opaco; su lado mayor ocupa `fraccion` del lienzo."""
    escala = lado * fraccion / max(logo.size)
    chico = logo.resize(
        (max(1, round(logo.width * escala)), max(1, round(logo.height * escala))),
        Image.LANCZOS,
    )
    salida = Image.new("RGB", (lado, lado), FONDO)
    salida.paste(chico, ((lado - chico.width) // 2, (lado - chico.height) // 2))
    return salida


def escribir_ico(destino, cuadros):
    """ICO con cuadros PNG. Se arma a mano para conservar el remuestreo LANCZOS de cada
    tamaño (Pillow, con `sizes=`, reduce todo desde un único cuadro)."""
    datos = []
    for cuadro in cuadros:
        buf = BytesIO()
        cuadro.convert("RGBA").save(buf, "PNG", optimize=True)
        datos.append(buf.getvalue())
    cabecera = struct.pack("<HHH", 0, 1, len(datos))
    offset = 6 + 16 * len(datos)
    directorio = b""
    for cuadro, png in zip(cuadros, datos):
        w, h = cuadro.size
        directorio += struct.pack("<BBBBHHII", w % 256, h % 256, 0, 0, 1, 32, len(png), offset)
        offset += len(png)
    destino.write_bytes(cabecera + directorio + b"".join(datos))


def main():
    logo = Image.open(ORIGEN).convert("RGB").crop(ESCUDO)
    (RAIZ / "icons").mkdir(exist_ok=True)

    escribir_ico(RAIZ / "favicon.ico", [lienzo(logo, n, FRACCION_FAVICON) for n in (16, 32, 48)])
    lienzo(logo, 180, FRACCION_ANY).save(RAIZ / "apple-touch-icon.png", optimize=True)
    for n in (192, 512):
        lienzo(logo, n, FRACCION_ANY).save(RAIZ / "icons" / f"icon-{n}.png", optimize=True)
        lienzo(logo, n, FRACCION_MASKABLE).save(RAIZ / "icons" / f"icon-maskable-{n}.png", optimize=True)
    print("Iconos generados desde", ORIGEN.name)


if __name__ == "__main__":
    main()
