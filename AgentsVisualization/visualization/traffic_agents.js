/*
 * 3D scene for Traffic Model visualization
 * Based on the city traffic simulation
 */

'use strict';

import * as twgl from 'twgl-base.js';
import GUI from 'lil-gui';
import { M4 } from '../libs/3d-lib';
import { Scene3D } from '../libs/scene3d';
import { Object3D } from '../libs/object3d';
import { Camera3D } from '../libs/camera3d';
import { loadMtl } from '../libs/obj_loader';

// Functions and arrays for the communication with the API
import {
    cars, obstacles, trafficLights, roads, destinations,
    initTrafficModel, update, getCars, getObstacles,
    getTrafficLights, getRoads, getDestinations
} from '../libs/api_connection_traffic.js';

// Define the shader code, using GLSL 3.00 - Phong Lighting
import vsGLSL from '../assets/shaders/vs_phong.glsl?raw';
import fsGLSL from '../assets/shaders/fs_phong.glsl?raw';

async function loadObjModel(modelName) {
    const response = await fetch(`../assets/models/${modelName}.obj`);
    if (!response.ok) {
        console.error(` Error al cargar ${modelName}.obj`);
        return null;
    }
    const objText = await response.text();
    console.log(` Modelo cargado: ${modelName}.obj`);
    return objText;
}

async function loadMtlFile(mtlPath) {
    const response = await fetch(mtlPath);
    if (!response.ok) {
        console.error(` Error al cargar MTL: ${mtlPath}`);
        return null;
    }
    const mtlText = await response.text();
    loadMtl(mtlText);
    console.log(` Materiales cargados: ${mtlPath}`);
    return true;
}


const scene = new Scene3D();

// Global variables
let phongProgramInfo = undefined;
let gl = undefined;
const duration = 1000; // ms
let elapsed = 0;
let then = 0;

// Global models for dynamic objects
let baseCubeModel = null;

// Arrays de modelos para rotación
let buildingModels = [];  // sushi_restaurant, SushiMini, WatchTower
let carModels = [];       // JapanCar, CanaryCruiser

// Lighting configuration
const lightingConfig = {
    // Ambient light (always present)
    ambientLight: [0.2, 0.2, 0.2, 1.0],

    // Sun light configuration
    sun: {
        position: [15, 30, 15],
        color: [1.0, 1.0, 0.9, 1.0],
        intensity: 1.1
    },

    // Traffic light intensity (subtle glow)
    trafficLightIntensity: 0.05
};

// Build array of all lights (sun + traffic lights)
function buildLightsArray() {
    const positions = [];
    const colors = [];
    const intensities = [];

    // Add sun as first light
    positions.push(...lightingConfig.sun.position);
    colors.push(...lightingConfig.sun.color);
    intensities.push(lightingConfig.sun.intensity);

    // Add traffic lights
    for (const light of trafficLights) {
        // Position slightly above the traffic light
        positions.push(light.position.x, light.position.y + 0.5, light.position.z);
        // Color based on state: green or red
        if (light.state) {
            colors.push(0.0, 1.0, 0.0, 1.0); // Green
        } else {
            colors.push(1.0, 0.0, 0.0, 1.0); // Red
        }
        intensities.push(lightingConfig.trafficLightIntensity);
    }

    return {
        count: 1 + trafficLights.length,
        positions: positions,
        colors: colors,
        intensities: intensities
    };
}




// Main function is async to be able to make the requests
async function main() {
    // Setup the canvas area
    const canvas = document.querySelector('canvas');
    gl = canvas.getContext('webgl2');
    twgl.resizeCanvasToDisplaySize(gl.canvas);
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);

    // Prepare the program with the shaders (Phong lighting)
    phongProgramInfo = twgl.createProgramInfo(gl, [vsGLSL, fsGLSL]);

    // Initialize the traffic model
    await initTrafficModel();

    // Get all the different elements from the city
    await getCars();
    await getObstacles();



    await getTrafficLights();
    await getRoads();
    await getDestinations();

    // Initialize the scene
    setupScene();

    // Position the objects in the scene
    setupObjects(scene, gl, phongProgramInfo);

    // Prepare the user interface
    setupUI();

    // First call to the drawing loop
    drawScene();
}


function setupScene() {
    let camera = new Camera3D(0,
        30,             // Distance to target
        4,              // Azimut
        0.6,            // Elevation
        [10, 0, 10],    // Target position (center of the city)
        [0, 0, 0]);
    // These values are empirical.
    camera.panOffset = [0, 8, 0];
    scene.setCamera(camera);
    scene.camera.setupControls();
}

async function setupObjects(scene, gl, programInfo) {
    // Create VAOs for the different shapes
    baseCubeModel = new Object3D(-1);
    baseCubeModel.prepareVAO(gl, programInfo);

    // Cargar modelos de edificios
    await loadMtlFile("../assets/models/sushi_restaurant.mtl");
    const sushiRestData = await loadObjModel("sushi_restaurant");

    await loadMtlFile("../assets/models/SushiMini.mtl");
    const sushiMiniData = await loadObjModel("SushiMini");

    /*
    await loadMtlFile("../assets/models/WatchTower.mtl");
    const watchTowerData = await loadObjModel("WatchTower");
    */

    // Cargar modelos de coches
    await loadMtlFile("../assets/models/JapanCar.mtl");
    const japanCarData = await loadObjModel("JapanCar");

    await loadMtlFile("../assets/models/CanaryCruiser.mtl");
    const canaryData = await loadObjModel("CanaryCruiser");

    // Crear modelos de edificios
    if (sushiRestData) {
        let model = new Object3D(-100);
        model.prepareVAO(gl, programInfo, sushiRestData);
        buildingModels.push({ model, scale: { x: 0.01, y: 0.01, z: 0.01 } });
    }
    if (sushiMiniData) {
        let model = new Object3D(-101);
        model.prepareVAO(gl, programInfo, sushiMiniData);
        buildingModels.push({ model, scale: { x: 0.01, y: 0.01, z: 0.01 } });
    }
    

    // Crear modelos de coches
    if (japanCarData) {
        let model = new Object3D(-103);
        model.prepareVAO(gl, programInfo, japanCarData);
        carModels.push({
            model,
            scale: { x: 0.003, y: 0.005, z: 0.003 },
            rotationOffset: Math.PI / 2,
            positionOffset: { x: 0, y: 0, z: 0.4 }  
        });
    }
    if (canaryData) {
        let model = new Object3D(-104);
        model.prepareVAO(gl, programInfo, canaryData);
        carModels.push({
            model,
            scale: { x: 0.003, y: 0.005, z: 0.003 },
            rotationOffset: 0,
            positionOffset: { x: 0, y: 0, z: 0 }
        });
    }

    // Add roads to the scene
    for (const road of roads) {
        road.arrays = baseCubeModel.arrays;
        road.bufferInfo = baseCubeModel.bufferInfo;
        road.vao = baseCubeModel.vao;
        road.scale = { x: 0.5, y: 0.1, z: 0.5 };
        scene.addObject(road);
    }

    // Add obstacles to the scene (rotando entre modelos de edificios)
    for (let i = 0; i < obstacles.length; i++) {
        const agent = obstacles[i];
        if (buildingModels.length > 0) {
            // Asignar modelo de edificio basado en el índice
            const buildingData = buildingModels[i % buildingModels.length];
            agent.arrays = buildingData.model.arrays;
            agent.bufferInfo = buildingData.model.bufferInfo;
            agent.vao = buildingData.model.vao;
            agent.scale = buildingData.scale;
            agent.useVertexColor = true;
        } else {
            agent.arrays = baseCubeModel.arrays;
            agent.bufferInfo = baseCubeModel.bufferInfo;
            agent.vao = baseCubeModel.vao;
            agent.scale = { x: 0.5, y: 0.5, z: 0.5 };
            agent.color = [0.7, 0.7, 0.7, 1.0];
        }
        scene.addObject(agent);
    }

    // Add traffic lights to the scene
    for (const light of trafficLights) {
        light.arrays = baseCubeModel.arrays;
        light.bufferInfo = baseCubeModel.bufferInfo;
        light.vao = baseCubeModel.vao;
        light.scale = { x: 0.5, y: 0.5, z: 0.5 };
        scene.addObject(light);
    }

    // Add destinations to the scene
    for (const dest of destinations) {
        dest.arrays = baseCubeModel.arrays;
        dest.bufferInfo = baseCubeModel.bufferInfo;
        dest.vao = baseCubeModel.vao;
        dest.scale = { x: 0.5, y: 0.3, z: 0.5 };
        scene.addObject(dest);
    }
}

// Contador para rotar modelos de coches
let carModelIndex = 0;

// Configura un coche con el modelo correcto
function setupCar(car) {
    if (!car.vao) {
        if (carModels.length > 0) {
            // Asignar modelo de coche rotando entre los disponibles
            const carData = carModels[carModelIndex % carModels.length];
            car.arrays = carData.model.arrays;
            car.bufferInfo = carData.model.bufferInfo;
            car.vao = carData.model.vao;
            car.scale = carData.scale;
            car.rotationOffset = carData.rotationOffset || 0;
            car.positionOffset = carData.positionOffset || { x: 0, y: 0, z: 0 };
            car.useVertexColor = true;
            carModelIndex++;
        } else {
            car.arrays = baseCubeModel.arrays;
            car.bufferInfo = baseCubeModel.bufferInfo;
            car.vao = baseCubeModel.vao;
            car.scale = { x: 0.4, y: 0.4, z: 0.4 };
            car.color = [1.0, 0.0, 0.0, 1.0];
        }
        scene.addObject(car);
    }
}


function setCarRotation(car) {
    const offset = car.rotationOffset || 0;
    switch (car.direction) {
        case "Up":
            car.rotRad = { x: 0, y: 0 + offset, z: 0 };
            break;
        case "Down":
            car.rotRad = { x: 0, y: Math.PI + offset, z: 0 };
            break;
        case "Right":
            car.rotRad = { x: 0, y: -Math.PI / 2 + offset, z: 0 };
            break;
        case "Left":
            car.rotRad = { x: 0, y: Math.PI / 2 + offset, z: 0 };
            break;
        default:
            car.rotRad = { x: 0, y: 0 + offset, z: 0 };
    }
}

/**
 * Linear interpolation between two values
 */
function lerp(a, b, t) {
    return a + (b - a) * t;
}


function getInterpolatedPosition(object, fract) {
    if (object.oldPosArray) {
        return [
            lerp(object.oldPosArray[0], object.posArray[0], fract),
            lerp(object.oldPosArray[1], object.posArray[1], fract),
            lerp(object.oldPosArray[2], object.posArray[2], fract)
        ];
    }
    return object.posArray;
}


function drawObject(gl, programInfo, object, viewProjectionMatrix, lights, fract) {
    
    let v3_tra = object.oldPosArray ? getInterpolatedPosition(object, fract) : object.posArray;

    
    if (object.positionOffset) {
        v3_tra = [
            v3_tra[0] + object.positionOffset.x,
            v3_tra[1] + object.positionOffset.y,
            v3_tra[2] + object.positionOffset.z
        ];
    }

    let v3_sca = object.scaArray;

    // Create the individual transform matrices
    const scaMat = M4.scale(v3_sca);
    const rotXMat = M4.rotationX(object.rotRad.x);
    const rotYMat = M4.rotationY(object.rotRad.y);
    const rotZMat = M4.rotationZ(object.rotRad.z);
    const traMat = M4.translation(v3_tra);

    // Create the composite world matrix (local to world space)
    let worldMatrix = M4.identity();
    worldMatrix = M4.multiply(scaMat, worldMatrix);
    worldMatrix = M4.multiply(rotXMat, worldMatrix);
    worldMatrix = M4.multiply(rotYMat, worldMatrix);
    worldMatrix = M4.multiply(rotZMat, worldMatrix);
    worldMatrix = M4.multiply(traMat, worldMatrix);

    object.matrix = worldMatrix;

    // Calculate world-view-projection matrix
    const worldViewProjection = M4.multiply(viewProjectionMatrix, worldMatrix);

    // Calculate inverse transpose for normals
    const worldInverseTransform = M4.transpose(M4.inverse(worldMatrix));

    // Get material properties (from MTL or defaults)
    const ambientColor = object.ambientColor || [0.2, 0.2, 0.2, 1.0];
    const diffuseColor = object.diffuseColor || object.color || [0.8, 0.8, 0.8, 1.0];
    const specularColor = object.specularColor || [1.0, 1.0, 1.0, 1.0];
    const shininess = object.shininess || 100;

    // Phong lighting uniforms with multiple lights
    let objectUniforms = {
        // Matrices
        u_world: worldMatrix,
        u_worldInverseTransform: worldInverseTransform,
        u_worldViewProjection: worldViewProjection,

        // Camera position
        u_viewWorldPosition: scene.camera.posArray,

        // Ambient light
        u_ambientLight: lightingConfig.ambientLight,

        // Multiple lights
        u_numLights: lights.count,
        u_lightPositions: lights.positions,
        u_lightColors: lights.colors,
        u_lightIntensities: lights.intensities,

        // Material properties
        u_ambientColor: ambientColor,
        u_diffuseColor: diffuseColor,
        u_specularColor: specularColor,
        u_shininess: shininess,
        u_useVertexColor: object.useVertexColor || false
    };

    twgl.setUniforms(programInfo, objectUniforms);

    gl.bindVertexArray(object.vao);
    twgl.drawBufferInfo(gl, object.bufferInfo);
}

// Function to do the actual display of the objects
async function drawScene() {
    // Compute time elapsed since last frame
    let now = Date.now();
    let deltaTime = now - then;
    elapsed += deltaTime;
    then = now;

    // Calculate interpolation fraction (0 to 1)
    let fract = Math.min(1.0, elapsed / duration);

    // Clear the canvas
    gl.clearColor(0.1, 0.1, 0.15, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // Enable face culling and depth testing
    gl.enable(gl.CULL_FACE);
    gl.enable(gl.DEPTH_TEST);

    scene.camera.checkKeys();
    const viewProjectionMatrix = setupViewProjection(gl);

    // Build lights array (sun + traffic lights)
    const lights = buildLightsArray();

    // Draw the objects with Phong lighting
    gl.useProgram(phongProgramInfo.program);
    for (let object of scene.objects) {
        drawObject(gl, phongProgramInfo, object, viewProjectionMatrix, lights, fract);
    }

    // Update the scene after the elapsed duration
    if (elapsed >= duration) {
        elapsed = 0;
        await update();
        // Setup new cars and update rotations
        for (const car of cars) {
            setupCar(car);
            setCarRotation(car);
        }
    }

    requestAnimationFrame(drawScene);
}

function setupViewProjection(gl) {
    // Field of view of 60 degrees vertically, in radians
    const fov = 60 * Math.PI / 180;
    const aspect = gl.canvas.clientWidth / gl.canvas.clientHeight;

    // Matrices for the world view
    const projectionMatrix = M4.perspective(fov, aspect, 1, 200);

    const cameraPosition = scene.camera.posArray;
    const target = scene.camera.targetArray;
    const up = [0, 1, 0];

    const cameraMatrix = M4.lookAt(cameraPosition, target, up);
    const viewMatrix = M4.inverse(cameraMatrix);
    const viewProjectionMatrix = M4.multiply(projectionMatrix, viewMatrix);

    return viewProjectionMatrix;
}

// Setup UI with camera controls
function setupUI() {
    const gui = new GUI();

    // Camera controls folder
    const cameraFolder = gui.addFolder('Camera Controls');

    // Camera settings object
    const cameraSettings = {
        distance: scene.camera.distance,
        azimuth: scene.camera.azimuth,
        elevation: scene.camera.elevation,
        targetX: scene.camera.target.x,
        targetY: scene.camera.target.y,
        targetZ: scene.camera.target.z,
        reset: function () {
            // Reset to default values
            this.distance = 30;
            this.azimuth = 4;
            this.elevation = 0.6;
            this.targetX = 12;
            this.targetY = 0;
            this.targetZ = 12;
            updateCamera();
        }
    };

    // Update camera function
    const updateCamera = () => {
        scene.camera.distance = cameraSettings.distance;
        scene.camera.azimuth = cameraSettings.azimuth;
        scene.camera.elevation = cameraSettings.elevation;
        scene.camera.target.x = cameraSettings.targetX;
        scene.camera.target.y = cameraSettings.targetY;
        scene.camera.target.z = cameraSettings.targetZ;
    };

    // Distance slider
    cameraFolder.add(cameraSettings, 'distance', 5, 100, 1)
        .name('Distance')
        .onChange(updateCamera);

    // Azimuth slider (horizontal rotation)
    cameraFolder.add(cameraSettings, 'azimuth', 0, Math.PI * 2, 0.1)
        .name('Azimuth (H)')
        .onChange(updateCamera);

    // Elevation slider (vertical rotation)
    cameraFolder.add(cameraSettings, 'elevation', 0, Math.PI / 2, 0.1)
        .name('Elevation (V)')
        .onChange(updateCamera);

    // Target position controls
    const targetFolder = cameraFolder.addFolder('Target Position');

    targetFolder.add(cameraSettings, 'targetX', 0, 24, 0.5)
        .name('Target X')
        .onChange(updateCamera);

    targetFolder.add(cameraSettings, 'targetY', -5, 10, 0.5)
        .name('Target Y')
        .onChange(updateCamera);

    targetFolder.add(cameraSettings, 'targetZ', 0, 24, 0.5)
        .name('Target Z')
        .onChange(updateCamera);

    // Reset button
    cameraFolder.add(cameraSettings, 'reset').name('Reset Camera');

    // Open camera folder by default
    cameraFolder.open();

    console.log("Traffic visualization initialized with camera controls");
}

main();
