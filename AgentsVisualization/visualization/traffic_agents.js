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
        console.error(`❌ Error al cargar ${modelName}.obj`);
        return null;
    }
    const objText = await response.text();
    console.log(`✅ Modelo cargado: ${modelName}.obj`);
    return objText;
}


const scene = new Scene3D();

// Global variables
let phongProgramInfo = undefined;
let gl = undefined;
const duration = 1000; // ms
let elapsed = 0;
let then = 0;

// Lighting configuration
const lightingConfig = {
    // Light position (world coordinates)
    lightPosition: [15, 20, 15],

    // Ambient light (always present, no direction)
    ambientLight: [0.3, 0.3, 0.3, 1.0],

    // Diffuse light (directional, main light source)
    diffuseLight: [1.0, 1.0, 1.0, 1.0],

    // Specular light (shiny highlights)
    specularLight: [1.0, 1.0, 1.0, 1.0]
};




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
        [12, 0, 12],    // Target position (center of the city)
        [0, 0, 0]);
    // These values are empirical.
    camera.panOffset = [0, 8, 0];
    scene.setCamera(camera);
    scene.camera.setupControls();
}

async function setupObjects(scene, gl, programInfo) {
    // Create VAOs for the different shapes
    const baseCube = new Object3D(-1);
    baseCube.prepareVAO(gl, programInfo);

    // Cargar modelo del restaurante de sushi
    console.log("🍣 Cargando restaurante de sushi...");
    const sushiData = await loadObjModel("sushi_restaurant");
    let sushiModel = null;
    
    if (sushiData) {
        sushiModel = new Object3D(-100);
        sushiModel.prepareVAO(gl, programInfo, sushiData);
        console.log("✅ Restaurante de sushi listo");
    }

    // Add roads to the scene
    for (const road of roads) {
        road.arrays = baseCube.arrays;
        road.bufferInfo = baseCube.bufferInfo;
        road.vao = baseCube.vao;
        road.scale = { x: 0.5, y: 0.1, z: 0.5 };
        scene.addObject(road);
    }

    // Add obstacles to the scene
    for (const agent of obstacles) {
    // Usar el modelo del restaurante SOLO en el primer obstáculo
    if (agent.id === obstacles[1].id && sushiModel) {
      console.log("🏗️ Aplicando restaurante de sushi al obstáculo:", agent.id);
      agent.arrays = sushiModel.arrays;
      agent.bufferInfo = sushiModel.bufferInfo;
      agent.vao = sushiModel.vao;
      agent.scale = { x: 0.01, y: 0.01, z: 0.01 }; // Escala pequeña - ajustar según sea necesario
      agent.color = [0.9, 0.7, 0.5, 1.0]; // Color café/beige para el restaurante
    } else {
      // El resto siguen siendo cubos
      agent.arrays = baseCube.arrays;
      agent.bufferInfo = baseCube.bufferInfo;
      agent.vao = baseCube.vao;
      agent.scale = { x: 0.5, y: 0.5, z: 0.5 };
      agent.color = [0.7, 0.7, 0.7, 1.0];
    }
    scene.addObject(agent);
  }

    // Add traffic lights to the scene
    for (const light of trafficLights) {
        light.arrays = baseCube.arrays;
        light.bufferInfo = baseCube.bufferInfo;
        light.vao = baseCube.vao;
        light.scale = { x: 0.5, y: 0.5, z: 0.5 };
        scene.addObject(light);
    }

    // Add destinations to the scene
    for (const dest of destinations) {
        dest.arrays = baseCube.arrays;
        dest.bufferInfo = baseCube.bufferInfo;
        dest.vao = baseCube.vao;
        dest.scale = { x: 0.5, y: 0.3, z: 0.5 };
        scene.addObject(dest);
    }

    // Add cars to the scene
    for (const car of cars) {
        car.arrays = baseCube.arrays;
        car.bufferInfo = baseCube.bufferInfo;
        car.vao = baseCube.vao;
        car.scale = { x: 0.4, y: 0.4, z: 0.4 };
        scene.addObject(car);
    }
}

// Draw an object with its corresponding transformations (Phong lighting)
function drawObject(gl, programInfo, object, viewProjectionMatrix, fract) {
    // Prepare the vector for translation and scale
    let v3_tra = object.posArray;
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

    // Phong lighting uniforms
    let objectUniforms = {
        // Matrices
        u_world: worldMatrix,
        u_worldInverseTransform: worldInverseTransform,
        u_worldViewProjection: worldViewProjection,

        // Light properties (scene-level)
        u_lightWorldPosition: lightingConfig.lightPosition,
        u_viewWorldPosition: scene.camera.posArray,
        u_ambientLight: lightingConfig.ambientLight,
        u_diffuseLight: lightingConfig.diffuseLight,
        u_specularLight: lightingConfig.specularLight,

        // Material properties (object-level)
        u_ambientColor: ambientColor,
        u_diffuseColor: diffuseColor,
        u_specularColor: specularColor,
        u_shininess: shininess
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
    let fract = Math.min(1.0, elapsed / duration);
    then = now;

    // Clear the canvas
    gl.clearColor(0.1, 0.1, 0.15, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // Enable face culling and depth testing
    gl.enable(gl.CULL_FACE);
    gl.enable(gl.DEPTH_TEST);

    scene.camera.checkKeys();
    const viewProjectionMatrix = setupViewProjection(gl);

    // Draw the objects with Phong lighting
    gl.useProgram(phongProgramInfo.program);
    for (let object of scene.objects) {
        drawObject(gl, phongProgramInfo, object, viewProjectionMatrix, fract);
    }

    // Update the scene after the elapsed duration
    if (elapsed >= duration) {
        elapsed = 0;
        await update();
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
