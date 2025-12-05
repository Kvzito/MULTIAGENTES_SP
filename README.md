# MULTIAGENTES_SP

## LINK VIDEO: https://drive.google.com/file/d/1JUmOb25lIG_TMARMODUXPNAB4AUoQbZM/view?usp=sharing 

_________________________

#### El propósito de este repositorio es alojar el proyecto a desarrollar a lo largo del curso TC2008B, el cuál busca simular una ciudad utilizando la tecnología de multiagentes y gráficas computacionales.
_______________________

## INTEGRANTES

- Kevin Javier Esquivel Villafuerte
- Héctor Lugo Gabino

_______________________

## CÓMO CORRER EL PROYECTO

### 0. Instalar dependencias de Python

Si es la primera vez que corres el proyecto, necesitas instalar las dependencias de Python:

```bash
# Activar el entorno virtual
.\.agents\Scripts\Activate

# Instalar las dependencias necesarias
pip install -U "mesa[all]" flask flask-cors
```

### 1. Inicializar el servidor de Python

Abre una terminal en la raíz del repositorio y ejecuta los siguientes comandos:

```bash
# Activar el entorno virtual
.\.agents\Scripts\Activate

# Navegar a la carpeta del servidor
cd AgentsVisualization/Server/trafficBase

# Iniciar el servidor
python traffic_server.py
```

### 2. Inicializar la visualización

Abre una **segunda terminal** y ejecuta:

```bash
# Navegar a la carpeta de visualización
cd AgentsVisualization

# Instalar dependencias
npm install

# Iniciar el servidor de desarrollo
npx vite
```

### 3. Abrir la simulación

Abre tu navegador y ve a la siguiente dirección:

🔗 **http://localhost:5173/visualization/index.html**

### ⚠️ Solución de problemas

Si la parte de Python se rompe o deja de responder, simplemente:
1. Cierra el navegador
2. Vuelve a abrir la liga http://localhost:5173/visualization/index.html
