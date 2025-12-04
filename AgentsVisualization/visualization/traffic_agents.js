/*
 * Escena 3D para visualizar el modelo de trafico
 * Simulacion de ciudad con carros, semaforos, edificios y destinos
 */

'use strict';

import * as twgl from 'twgl-base.js';
import GUI from 'lil-gui';
import { M4 } from '../libs/3d-lib';
import { Scene3D } from '../libs/scene3d';
import { Object3D } from '../libs/object3d';
import { Camera3D } from '../libs/camera3d';
import { preloadModel } from '../libs/obj_loader.js';

// Comunicacion con la API del servidor
import {
    cars, obstacles, trafficLights, roads, destinations, metrics,
    initTrafficModel, update, getCars, getObstacles,
    getTrafficLights, getRoads, getDestinations, getMetrics, setSpawnInterval
} from '../libs/api_connection_traffic.js';

// Shaders para iluminacion Phong
import vsGLSL from '../assets/shaders/vs_phong.glsl?raw';
import fsGLSL from '../assets/shaders/fs_phong.glsl?raw';

// Rutas y nombres de los modelos 3D
const MODELS_PATH = '../3d-modelos-obj/';
const BUILDING_MODELS = ['Building1', 'PuestoJochos'];
const CAR_MODELS = ['redCarBlendobj', 'ClassicCarBlend'];
const TRAFFIC_LIGHT_MODEL = 'Semaforo';
const DESTINATION_MODEL = 'EstacionamientoObjetivo';
const TREE_MODEL = 'ArbolBlend';

// Cache de modelos precargados
let carModels = [];
let buildingModels = [];
let trafficLightModel = null;
let destinationModel = null;
let treeModel = null;

// Esferitas que indican el color del semaforo (verde/rojo)
const trafficLightSpheres = new Map();

// Rotaciones segun la direccion del carro
const DIRECTION_ROTATIONS = {
    'Up': Math.PI,
    'Down': 0,
    'Left': Math.PI / 2,
    'Right': -Math.PI / 2
};

// Escala global, si quieres hacer todo mas grande solo sube este numero
const GLOBAL_SCALE = 1.5;

// Offsets para que los carros no se vean enterrados en el piso
const CAR_Y_OFFSET = 0.30;
const CAR_Z_OFFSET = -0.15;

const scene = new Scene3D();

// Variables globales
let phongProgramInfo = undefined;
let gl = undefined;
const duration = 500; // milisegundos entre cada actualizacion
let elapsed = 0;
let then = 0;

// Configuracion de luces, ambiente tipo atardecer
const lightingConfig = {
    ambientLight: [0.5, 0.5, 0.5, 1.0],

    lights: [
        // Sol principal, bajo y anaranjado
        { position: [-20, 20, 30], color: [0.5, 0.5, 0.7, 1.0], intensity: 1.2 },
        // Reflejo calido del otro lado
        { position: [40, 5, -10], color: [1.0, 0.35, 0.15, 1.0], intensity: 0.6 },
        // Luz suave del cielo desde arriba
        { position: [12, 40, 12], color: [0.4, 0.3, 0.5, 1.0], intensity: 0.3 },
        // Rebote del suelo
        { position: [12, -5, 12], color: [0.8, 0.4, 0.2, 1.0], intensity: 0.2 }
    ]
};


// Precarga todos los modelos 3D antes de empezar
async function preloadAllModels(gl, programInfo) {

    for (const carName of CAR_MODELS) {
        const model = await preloadModel(gl, programInfo, MODELS_PATH, carName, 1.5);
        if (model) {
            carModels.push({ name: carName, ...model });
        }
    }

    trafficLightModel = await preloadModel(gl, programInfo, MODELS_PATH, TRAFFIC_LIGHT_MODEL, 1.0);
    destinationModel = await preloadModel(gl, programInfo, MODELS_PATH, DESTINATION_MODEL, 1.0);
    treeModel = await preloadModel(gl, programInfo, MODELS_PATH, TREE_MODEL, 1.0);

    for (const buildingName of BUILDING_MODELS) {
        const model = await preloadModel(gl, programInfo, MODELS_PATH, buildingName, 1.0);
        if (model) {
            buildingModels.push({ name: buildingName, ...model });
        }
    }
}

// Funcion principal, es async porque hace peticiones al servidor
async function main() {
    const canvas = document.querySelector('canvas');
    gl = canvas.getContext('webgl2');
    twgl.resizeCanvasToDisplaySize(gl.canvas);
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);

    phongProgramInfo = twgl.createProgramInfo(gl, [vsGLSL, fsGLSL]);

    // Hay que precargar los modelos antes de iniciar la escena
    await preloadAllModels(gl, phongProgramInfo);

    await initTrafficModel();

    // Traer todos los elementos de la ciudad desde el servidor
    await getCars();
    await getObstacles();
    await getTrafficLights();
    await getRoads();
    await getDestinations();
    await getMetrics();

    setupScene();
    setupObjects(scene, gl, phongProgramInfo);
    setupUI();

    // Actualizar metricas iniciales en la UI
    if (window.updateMetricsUI) {
        window.updateMetricsUI();
    }

    drawScene();
}


function setupScene() {
    // Valores encontrados a prueba y error para que se vea bien la ciudad
    let camera = new Camera3D(0,
        30,             // Distancia al objetivo
        4,              // Azimut
        0.6,            // Elevacion
        [12, 0, 12],    // Centro de la ciudad
        [0, 0, 0]);
    camera.panOffset = [0, 8, 0];
    scene.setCamera(camera);
    scene.camera.setupControls();
}

async function setupObjects(scene, gl, programInfo) {
    // Cubo base que se reutiliza para calles, pasto, etc
    const baseCube = new Object3D(-1);
    baseCube.prepareVAO(gl, programInfo);

    // Agregar calles
    for (const road of roads) {
        road.arrays = baseCube.arrays;
        road.bufferInfo = baseCube.bufferInfo;
        road.vao = baseCube.vao;
        road.scale = { x: 0.5 * GLOBAL_SCALE, y: 0.1 * GLOBAL_SCALE, z: 0.5 * GLOBAL_SCALE };
        road.color = [0.25, 0.25, 0.27, 1.0];
        road.diffuseColor = [0.2, 0.2, 0.22, 1.0];
        road.specularColor = [0.05, 0.05, 0.05, 1.0];
        road.shininess = 4;
        road.useVertexColor = false;
        scene.addObject(road);
    }

    // Guardamos posiciones de destinos para no poner edificios encima
    const destinationPositions = new Set();
    for (const dest of destinations) {
        destinationPositions.add(`${Math.round(dest.position.x)},${Math.round(dest.position.z)}`);
    }

    // Agrupar obstaculos contiguos en areas (para saber donde poner edificios)
    const obstacleGroups = groupContiguousObstacles(obstacles);

    let buildingIndex = 0;
    let puestoJochosCount = 0;
    const MAX_PUESTO_JOCHOS = 3;

    for (const group of obstacleGroups) {
        const minX = Math.min(...group.map(o => o.position.x));
        const maxX = Math.max(...group.map(o => o.position.x));
        const minZ = Math.min(...group.map(o => o.position.z));
        const maxZ = Math.max(...group.map(o => o.position.z));

        // Si hay un destino cerca, no ponemos edificio ahi
        const hasAdjacentDestination = group.some(obs => {
            const x = Math.round(obs.position.x);
            const z = Math.round(obs.position.z);
            return destinationPositions.has(`${x},${z}`) ||
                   destinationPositions.has(`${x+1},${z}`) ||
                   destinationPositions.has(`${x-1},${z}`) ||
                   destinationPositions.has(`${x},${z+1}`) ||
                   destinationPositions.has(`${x},${z-1}`);
        });

        // Poner pasto en cada posicion del grupo
        let treeIndex = 0;
        for (const obs of group) {
            const grassTile = new Object3D(
                `grass_${obs.id}`,
                [obs.position.x, obs.position.y, obs.position.z],
                [0, 0, 0],
                [1, 1, 1]
            );
            grassTile.arrays = baseCube.arrays;
            grassTile.bufferInfo = baseCube.bufferInfo;
            grassTile.vao = baseCube.vao;
            grassTile.scale = { x: 0.5 * GLOBAL_SCALE, y: 0.15 * GLOBAL_SCALE, z: 0.5 * GLOBAL_SCALE };
            grassTile.color = [0.22, 0.45, 0.22, 1.0];
            grassTile.diffuseColor = [0.2, 0.4, 0.2, 1.0];
            grassTile.specularColor = [0.02, 0.02, 0.02, 1.0];
            grassTile.shininess = 2;
            grassTile.useVertexColor = false;
            scene.addObject(grassTile);

            // Arboles al azar, como 20% de probabilidad
            if (treeModel && Math.random() < 0.2) {
                const tree = new Object3D(
                    `tree_${obs.id}_${treeIndex++}`,
                    [0, 0, 0],
                    [0, 0, 0],
                    [1, 1, 1]
                );
                tree.arrays = treeModel.arrays;
                tree.bufferInfo = treeModel.bufferInfo;
                tree.vao = treeModel.vao;
                tree.position = { x: obs.position.x, y: obs.position.y + 0.2, z: obs.position.z };
                tree.scale = { x: 0.003 * GLOBAL_SCALE, y: 0.003 * GLOBAL_SCALE, z: 0.003 * GLOBAL_SCALE };
                tree.rotRad = { x: 0, y: Math.random() * Math.PI * 2, z: 0 };
                scene.addObject(tree);
            }
        }

        if (hasAdjacentDestination) continue;
        if (buildingModels.length === 0) continue;

        // Checar si es un area chica (fila) o grande (bloque)
        const width = maxX - minX + 1;
        const height = maxZ - minZ + 1;
        const isSmallArea = group.length <= 3 || width === 1 || height === 1;

        // Areas chicas solo ponen PuestoJochos si no hemos llegado al limite
        if (isSmallArea) {
            if (puestoJochosCount >= MAX_PUESTO_JOCHOS) {
                continue;
            }
            const puestoModel = buildingModels.find(b => b.name === 'PuestoJochos');
            if (!puestoModel) continue;

            puestoJochosCount++;

            const randomObs = group[Math.floor(Math.random() * group.length)];
            const baseY = randomObs.position.y;

            const buildingObj = new Object3D(
                `building_${++buildingIndex}`,
                [0, 0, 0],
                [0, 0, 0],
                [1, 1, 1]
            );

            buildingObj.arrays = puestoModel.arrays;
            buildingObj.bufferInfo = puestoModel.bufferInfo;
            buildingObj.vao = puestoModel.vao;
            buildingObj.position = { x: randomObs.position.x, y: baseY + 0.15, z: randomObs.position.z };
            buildingObj.scale = { x: 0.003 * GLOBAL_SCALE, y: 0.003 * GLOBAL_SCALE, z: 0.003 * GLOBAL_SCALE };
            buildingObj.rotRad = { x: 0, y: Math.floor(Math.random() * 4) * (Math.PI / 2), z: 0 };
            buildingObj.color = [0.8, 0.8, 0.8, 1.0];

            scene.addObject(buildingObj);
        } else {
            // Areas grandes usan Building1
            const building1Model = buildingModels.find(b => b.name === 'Building1');
            if (!building1Model) continue;

            const randomObs = group[Math.floor(Math.random() * group.length)];
            const baseY = randomObs.position.y;

            const buildingObj = new Object3D(
                `building_${++buildingIndex}`,
                [0, 0, 0],
                [0, 0, 0],
                [1, 1, 1]
            );

            buildingObj.arrays = building1Model.arrays;
            buildingObj.bufferInfo = building1Model.bufferInfo;
            buildingObj.vao = building1Model.vao;
            buildingObj.position = { x: randomObs.position.x, y: baseY, z: randomObs.position.z };
            buildingObj.scale = { x: 0.003 * GLOBAL_SCALE, y: 0.003 * GLOBAL_SCALE, z: 0.003 * GLOBAL_SCALE };
            buildingObj.rotRad = { x: 0, y: Math.floor(Math.random() * 4) * (Math.PI / 2), z: 0 };
            buildingObj.color = [0.8, 0.8, 0.8, 1.0];

            scene.addObject(buildingObj);
        }
    }

    // Semaforos, con calle abajo
    for (const light of trafficLights) {
        const roadUnderLight = new Object3D(
            `road_light_${light.id}`,
            [light.position.x, light.position.y, light.position.z]
        );
        roadUnderLight.arrays = baseCube.arrays;
        roadUnderLight.bufferInfo = baseCube.bufferInfo;
        roadUnderLight.vao = baseCube.vao;
        roadUnderLight.scale = { x: 0.5 * GLOBAL_SCALE, y: 0.1 * GLOBAL_SCALE, z: 0.5 * GLOBAL_SCALE };
        roadUnderLight.color = [0.4, 0.4, 0.4, 1.0];
        roadUnderLight.useVertexColor = false;
        scene.addObject(roadUnderLight);

        if (trafficLightModel) {
            light.arrays = trafficLightModel.arrays;
            light.bufferInfo = trafficLightModel.bufferInfo;
            light.vao = trafficLightModel.vao;
            light.scale = { x: 0.005 * GLOBAL_SCALE, y: 0.005 * GLOBAL_SCALE, z: 0.005 * GLOBAL_SCALE };
            light.position.y = 2.5;
        } else {
            light.arrays = baseCube.arrays;
            light.bufferInfo = baseCube.bufferInfo;
            light.vao = baseCube.vao;
            light.scale = { x: 0.3 * GLOBAL_SCALE, y: 0.6 * GLOBAL_SCALE, z: 0.3 * GLOBAL_SCALE };
        }
        scene.addObject(light);

        // Esferita que brilla verde o rojo segun el estado del semaforo
        const lightSphere = new Object3D(
            `light_sphere_${light.id}`,
            [light.position.x, light.position.y + 0.8, light.position.z],
            [0, 0, 0],
            [1, 1, 1]
        );
        lightSphere.arrays = baseCube.arrays;
        lightSphere.bufferInfo = baseCube.bufferInfo;
        lightSphere.vao = baseCube.vao;
        lightSphere.scale = { x: 0.18 * GLOBAL_SCALE, y: 0.18 * GLOBAL_SCALE, z: 0.18 * GLOBAL_SCALE };
        lightSphere.color = light.state ? [0.2, 1.0, 0.2, 1.0] : [1.0, 0.2, 0.1, 1.0];
        lightSphere.diffuseColor = light.state ? [0.3, 1.2, 0.3, 1.0] : [1.2, 0.3, 0.15, 1.0];
        lightSphere.specularColor = [1.0, 1.0, 1.0, 1.0];
        lightSphere.shininess = 64;
        lightSphere.ambientColor = light.state ? [0.1, 0.5, 0.1, 1.0] : [0.5, 0.1, 0.05, 1.0];
        lightSphere.useVertexColor = false;
        scene.addObject(lightSphere);

        trafficLightSpheres.set(light.id, lightSphere);
    }

    // Destinos (estacionamientos donde llegan los carros)
    const DEST_Y_OFFSET = 0.3;
    for (const dest of destinations) {
        if (destinationModel) {
            dest.arrays = destinationModel.arrays;
            dest.bufferInfo = destinationModel.bufferInfo;
            dest.vao = destinationModel.vao;
            dest.scale = { x: 0.002 * GLOBAL_SCALE, y: 0.002 * GLOBAL_SCALE, z: 0.002 * GLOBAL_SCALE };

            const originalX = dest.position.x;
            const originalZ = dest.position.z;
            dest.position.y += DEST_Y_OFFSET;

            // Buscar la calle mas cercana para orientar el destino hacia ella
            let rotation = 0;
            let minDist = Infinity;
            let closestRoad = null;

            for (const road of roads) {
                const dx = road.position.x - originalX;
                const dz = road.position.z - originalZ;
                const dist = Math.abs(dx) + Math.abs(dz);

                if (dist < 1.5 && dist < minDist) {
                    minDist = dist;
                    closestRoad = { dx, dz };
                }
            }

            if (closestRoad) {
                const { dx, dz } = closestRoad;
                if (Math.abs(dx) > Math.abs(dz)) {
                    rotation = dx > 0 ? -Math.PI / 2 : Math.PI / 2;
                } else {
                    rotation = dz > 0 ? Math.PI : 0;
                }
            }

            dest.rotRad = { x: 0, y: rotation, z: 0 };
        } else {
            dest.arrays = baseCube.arrays;
            dest.bufferInfo = baseCube.bufferInfo;
            dest.vao = baseCube.vao;
            dest.scale = { x: 0.5 * GLOBAL_SCALE, y: 0.3 * GLOBAL_SCALE, z: 0.5 * GLOBAL_SCALE };
        }
        scene.addObject(dest);
    }

    // Carros, se les asigna un modelo al azar
    for (const car of cars) {
        if (carModels.length > 0) {
            const randomCarModel = carModels[Math.floor(Math.random() * carModels.length)];
            car.arrays = randomCarModel.arrays;
            car.bufferInfo = randomCarModel.bufferInfo;
            car.vao = randomCarModel.vao;
            car.scale = { x: 0.002 * GLOBAL_SCALE, y: 0.002 * GLOBAL_SCALE, z: 0.0015 * GLOBAL_SCALE };
            car.renderPos = {
                x: car.position.x,
                y: car.position.y + CAR_Y_OFFSET,
                z: car.position.z + CAR_Z_OFFSET
            };
            car.currentRotY = 0;
            car.targetRotY = 0;
            updateCarRotation(car);
        } else {
            car.arrays = baseCube.arrays;
            car.bufferInfo = baseCube.bufferInfo;
            car.vao = baseCube.vao;
            car.scale = { x: 0.4 * GLOBAL_SCALE, y: 0.4 * GLOBAL_SCALE, z: 0.4 * GLOBAL_SCALE };
        }
        scene.addObject(car);
    }
}

// Agrupa obstaculos contiguos usando flood-fill 
function groupContiguousObstacles(obstacles) {
    const groups = [];
    const visited = new Set();

    const posMap = new Map();
    for (const obs of obstacles) {
        const key = `${Math.round(obs.position.x)},${Math.round(obs.position.z)}`;
        posMap.set(key, obs);
    }

    // Vecinos en 4 direcciones
    function getNeighbors(obs) {
        const x = Math.round(obs.position.x);
        const z = Math.round(obs.position.z);
        const neighbors = [];
        const directions = [[1, 0], [-1, 0], [0, 1], [0, -1]];

        for (const [dx, dz] of directions) {
            const key = `${x + dx},${z + dz}`;
            if (posMap.has(key) && !visited.has(key)) {
                neighbors.push(posMap.get(key));
            }
        }
        return neighbors;
    }

    for (const obs of obstacles) {
        const key = `${Math.round(obs.position.x)},${Math.round(obs.position.z)}`;
        if (visited.has(key)) continue;

        const group = [];
        const stack = [obs];

        while (stack.length > 0) {
            const current = stack.pop();
            const currentKey = `${Math.round(current.position.x)},${Math.round(current.position.z)}`;

            if (visited.has(currentKey)) continue;
            visited.add(currentKey);
            group.push(current);

            const neighbors = getNeighbors(current);
            stack.push(...neighbors);
        }

        if (group.length > 0) {
            groups.push(group);
        }
    }

    return groups;
}

// Interpolacion lineal basica
function lerp(start, end, t) {
    return start + (end - start) * t;
}

// Interpolacion de angulos que maneja el wraparound de 360 grados
function lerpAngle(start, end, t) {
    let diff = end - start;
    while (diff > Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;
    return start + diff * t;
}

function updateCarRotation(car) {
    // Calcular rotacion basada en el movimiento real, no en la direccion de la calle
    if (car.oldPosArray && car.posArray) {
        const dx = car.posArray[0] - car.oldPosArray[0];
        const dz = car.posArray[2] - car.oldPosArray[2];

        // Solo actualizar si hay movimiento significativo
        if (Math.abs(dx) > 0.01 || Math.abs(dz) > 0.01) {
            // Calcular angulo basado en la direccion del movimiento
            car.targetRotY = Math.atan2(dx, dz);
        }
    } else if (car.direction && DIRECTION_ROTATIONS.hasOwnProperty(car.direction)) {
        // Fallback para carros nuevos sin posicion anterior
        car.targetRotY = DIRECTION_ROTATIONS[car.direction];
    }
}

// Actualiza carros: quita los que llegaron a su destino, agrega los nuevos
function updateCars() {
    const currentCarIds = new Set(cars.map(c => c.id));

    // Quitar de la escena los carros que ya no estan en la API
    const carVAOs = new Set(carModels.map(m => m.vao));
    const carsInScene = scene.objects.filter(obj =>
        obj.id && carVAOs.has(obj.vao)
    );

    for (const carInScene of carsInScene) {
        if (!currentCarIds.has(carInScene.id)) {
            scene.removeObject(carInScene);
        }
    }

    // Agregar carros nuevos y actualizar los existentes
    for (const car of cars) {
        if (!car.vao && carModels.length > 0) {
            const randomCarModel = carModels[Math.floor(Math.random() * carModels.length)];
            car.arrays = randomCarModel.arrays;
            car.bufferInfo = randomCarModel.bufferInfo;
            car.vao = randomCarModel.vao;
            car.scale = { x: 0.002 * GLOBAL_SCALE, y: 0.002 * GLOBAL_SCALE, z: 0.0015 * GLOBAL_SCALE };
            car.currentRotY = 0;
            car.targetRotY = 0;
            scene.addObject(car);
        }

        updateCarRotation(car);
    }
}

// Interpola posiciones de carros usando doble buffer
// Interpolacion lineal simple de oldPos a currentPos
function interpolateCars(fract) {
    for (const car of cars) {
        if (!car.oldPosArray) continue;

        const oldPos = car.oldPosArray;
        const currentPos = car.posArray;

        // Interpolacion lineal simple entre posicion anterior y actual
        const interpX = lerp(oldPos[0], currentPos[0], fract);
        const interpZ = lerp(oldPos[2], currentPos[2], fract);
        const interpY = currentPos[1];

        car.renderPos = {
            x: interpX,
            y: interpY + CAR_Y_OFFSET,
            z: interpZ + CAR_Z_OFFSET
        };

        if (car.targetRotY !== undefined) {
            car.currentRotY = lerpAngle(car.currentRotY || 0, car.targetRotY, Math.min(fract * 2, 1.0));
            car.rotRad.y = car.currentRotY;
        }
    }
}

// Actualiza el color de las cubos de los semaforos
function updateTrafficLightSpheres() {
    for (const light of trafficLights) {
        const sphere = trafficLightSpheres.get(light.id);
        if (sphere) {
            sphere.color = light.state ? [0.2, 1.0, 0.2, 1.0] : [1.0, 0.2, 0.1, 1.0];
            sphere.diffuseColor = light.state ? [0.3, 1.2, 0.3, 1.0] : [1.2, 0.3, 0.15, 1.0];
            sphere.ambientColor = light.state ? [0.1, 0.5, 0.1, 1.0] : [0.5, 0.1, 0.05, 1.0];
        }
    }
}

// Dibuja un objeto con sus transformaciones y iluminacion Phong
function drawObject(gl, programInfo, object, viewProjectionMatrix, fract) {
    // Para carros usa renderPos (interpolado), sino usa posArray
    let v3_tra = object.renderPos
        ? [object.renderPos.x, object.renderPos.y, object.renderPos.z]
        : object.posArray;
    let v3_sca = object.scaArray;

    // Matrices de transformacion
    const scaMat = M4.scale(v3_sca);
    const rotXMat = M4.rotationX(object.rotRad.x);
    const rotYMat = M4.rotationY(object.rotRad.y);
    const rotZMat = M4.rotationZ(object.rotRad.z);
    const traMat = M4.translation(v3_tra);

    // Matriz mundo compuesta (de espacio local a mundo)
    let worldMatrix = M4.identity();
    worldMatrix = M4.multiply(scaMat, worldMatrix);
    worldMatrix = M4.multiply(rotXMat, worldMatrix);
    worldMatrix = M4.multiply(rotYMat, worldMatrix);
    worldMatrix = M4.multiply(rotZMat, worldMatrix);
    worldMatrix = M4.multiply(traMat, worldMatrix);

    object.matrix = worldMatrix;

    const worldViewProjection = M4.multiply(viewProjectionMatrix, worldMatrix);
    const worldInverseTransform = M4.transpose(M4.inverse(worldMatrix));

    // Propiedades del material
    const ambientColor = object.ambientColor || [0.4, 0.4, 0.4, 1.0];
    const diffuseColor = object.diffuseColor || object.color || [0.8, 0.8, 0.8, 1.0];
    const specularColor = object.specularColor || [0.8, 0.8, 0.8, 1.0];
    const shininess = object.shininess || 32;

    // Arrays de luces para el shader
    const numLights = lightingConfig.lights.length;
    const lightPositions = lightingConfig.lights.flatMap(l => l.position);
    const lightColors = lightingConfig.lights.flatMap(l => l.color);
    const lightIntensities = lightingConfig.lights.map(l => l.intensity);

    let objectUniforms = {
        u_world: worldMatrix,
        u_worldInverseTransform: worldInverseTransform,
        u_worldViewProjection: worldViewProjection,
        u_viewWorldPosition: scene.camera.posArray,
        u_ambientLight: lightingConfig.ambientLight,
        u_numLights: numLights,
        u_lightPositions: lightPositions,
        u_lightColors: lightColors,
        u_lightIntensities: lightIntensities,
        u_ambientColor: ambientColor,
        u_diffuseColor: diffuseColor,
        u_specularColor: specularColor,
        u_shininess: shininess,
        u_useVertexColor: object.useVertexColor !== false
    };

    twgl.setUniforms(programInfo, objectUniforms);

    gl.bindVertexArray(object.vao);
    twgl.drawBufferInfo(gl, object.bufferInfo);
}

// Loop principal de dibujado
async function drawScene() {
    let now = Date.now();
    let deltaTime = now - then;
    elapsed += deltaTime;
    let fract = Math.min(1.0, elapsed / duration);
    then = now;

    // Color de fondo tipo atardecer
    gl.clearColor(0.45, 0.25, 0.35, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    gl.enable(gl.CULL_FACE);
    gl.enable(gl.DEPTH_TEST);

    scene.camera.checkKeys();
    const viewProjectionMatrix = setupViewProjection(gl);

    interpolateCars(fract);

    gl.useProgram(phongProgramInfo.program);
    for (let object of scene.objects) {
        drawObject(gl, phongProgramInfo, object, viewProjectionMatrix, fract);
    }

    // Cuando pasa el tiempo de duracion, actualizar desde el servidor
    if (elapsed >= duration) {
        elapsed = 0;
        await update();
        updateCars();
        updateTrafficLightSpheres();
        // Actualizar metricas en la UI
        if (window.updateMetricsUI) {
            window.updateMetricsUI();
        }
    }

    requestAnimationFrame(drawScene);
}

function setupViewProjection(gl) {
    const fov = 60 * Math.PI / 180; // 60 grados de campo de vision
    const aspect = gl.canvas.clientWidth / gl.canvas.clientHeight;

    const projectionMatrix = M4.perspective(fov, aspect, 1, 200);
    const cameraPosition = scene.camera.posArray;
    const target = scene.camera.targetArray;
    const up = [0, 1, 0];

    const cameraMatrix = M4.lookAt(cameraPosition, target, up);
    const viewMatrix = M4.inverse(cameraMatrix);
    const viewProjectionMatrix = M4.multiply(projectionMatrix, viewMatrix);

    return viewProjectionMatrix;
}

// Controles de camara con lil-gui
function setupUI() {
    const gui = new GUI();

    // Panel de Metricas de Simulacion
    const metricsFolder = gui.addFolder('Metricas de Simulacion');

    const metricsDisplay = {
        step: 0,
        spawned: 0,
        arrived: 0,
        active: 0
    };

    // Controladores para mostrar los valores (solo lectura)
    metricsFolder.add(metricsDisplay, 'step')
        .name('Paso Actual')
        .listen()
        .disable();

    metricsFolder.add(metricsDisplay, 'spawned')
        .name('Total Spawneados')
        .listen()
        .disable();

    metricsFolder.add(metricsDisplay, 'arrived')
        .name('Llegaron a Destino')
        .listen()
        .disable();

    metricsFolder.add(metricsDisplay, 'active')
        .name('Carros Activos')
        .listen()
        .disable();

    metricsFolder.open();

    // Funcion para actualizar metricas en el UI
    window.updateMetricsUI = () => {
        metricsDisplay.step = metrics.current_step;
        metricsDisplay.spawned = metrics.total_spawned;
        metricsDisplay.arrived = metrics.total_reached_destination;
        metricsDisplay.active = metrics.current_active_cars;
    };

    // Controles de Camara
    const cameraFolder = gui.addFolder('Controles de Camara');

    const cameraSettings = {
        distance: scene.camera.distance,
        azimuth: scene.camera.azimuth,
        elevation: scene.camera.elevation,
        targetX: scene.camera.target.x,
        targetY: scene.camera.target.y,
        targetZ: scene.camera.target.z,
        reset: function () {
            this.distance = 30;
            this.azimuth = 4;
            this.elevation = 0.6;
            this.targetX = 12;
            this.targetY = 0;
            this.targetZ = 12;
            updateCamera();
        }
    };

    const updateCamera = () => {
        scene.camera.distance = cameraSettings.distance;
        scene.camera.azimuth = cameraSettings.azimuth;
        scene.camera.elevation = cameraSettings.elevation;
        scene.camera.target.x = cameraSettings.targetX;
        scene.camera.target.y = cameraSettings.targetY;
        scene.camera.target.z = cameraSettings.targetZ;
    };

    cameraFolder.add(cameraSettings, 'distance', 5, 100, 1)
        .name('Distancia')
        .onChange(updateCamera);

    cameraFolder.add(cameraSettings, 'azimuth', 0, Math.PI * 2, 0.1)
        .name('Azimut')
        .onChange(updateCamera);

    cameraFolder.add(cameraSettings, 'elevation', 0, Math.PI / 2, 0.1)
        .name('Elevacion')
        .onChange(updateCamera);

    const targetFolder = cameraFolder.addFolder('Posicion Objetivo');

    targetFolder.add(cameraSettings, 'targetX', 0, 24, 0.5)
        .name('Objetivo X')
        .onChange(updateCamera);

    targetFolder.add(cameraSettings, 'targetY', -5, 10, 0.5)
        .name('Objetivo Y')
        .onChange(updateCamera);

    targetFolder.add(cameraSettings, 'targetZ', 0, 24, 0.5)
        .name('Objetivo Z')
        .onChange(updateCamera);

    cameraFolder.add(cameraSettings, 'reset').name('Reiniciar Camara');
    cameraFolder.open();

    console.log("Visualizacion de trafico inicializada");
}

main();
