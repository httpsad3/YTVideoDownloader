from pytubefix import YouTube
import os
import subprocess
import re

# 👉 Cambia esto según lo que necesites
AGREGAR_INDICE_EN_NOMBRE = True  # True = [0]_video.mp4, False = video.mp4

def sanitize_filename(name):
    # Reemplaza caracteres problemáticos en nombres de archivo
    return re.sub(r'[\\/*?:"<>|()\']', '_', name)

def download_best_quality(link, line_number, index):
    try:
        yt = YouTube(link)
        video_stream = yt.streams.filter(only_video=True, file_extension='mp4').order_by('resolution').desc().first()
        audio_stream = yt.streams.filter(only_audio=True, file_extension='mp4').order_by('abr').desc().first()

        if not video_stream or not audio_stream:
            raise Exception("No se encontraron streams de video o audio")

        title = sanitize_filename(yt.title.replace(" ", "_"))
        prefix = f"[{index}]_" if AGREGAR_INDICE_EN_NOMBRE else ""
        video_path = f"{prefix}{title}_video.mp4"
        audio_path = f"{prefix}{title}_audio.mp4"
        output_path = f"{prefix}{title}.mp4"

        print(f"🔽 [Línea {line_number}] Descargando: {yt.title} ({video_stream.resolution})")
        video_stream.download(filename=video_path)

        print("🔽 Descargando audio")
        audio_stream.download(filename=audio_path)

        # Verificar que los archivos se hayan descargado
        if not os.path.exists(video_path) or not os.path.exists(audio_path):
            raise FileNotFoundError("No se encontró uno de los archivos descargados")

        print("🎬 Uniendo con ffmpeg...")
        subprocess.run([
            "ffmpeg", "-y",
            "-i", video_path,
            "-i", audio_path,
            "-c:v", "copy",
            "-c:a", "aac",
            output_path
        ], check=True)

        print(f"✅ Video final guardado como: {output_path}")
        os.remove(video_path)
        os.remove(audio_path)
        print("🧹 Archivos temporales eliminados\n")

    except Exception as e:
        print(f"❌ Error en línea {line_number}: {link}")
        print(f"   Detalle: {str(e)}\n")

# Leer links con número de línea
with open("links.txt", "r") as file:
    lines = [(i + 1, line.strip()) for i, line in enumerate(file) if line.strip()]

# Ejecutar descargas
for index, (line_number, url) in enumerate(lines):
    download_best_quality(url, line_number, index)
