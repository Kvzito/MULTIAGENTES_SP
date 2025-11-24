/*
 * 3D scene for Traffic Model visualization
 * Based on the city traffic simulation
 *
 * Modified from random_agents.js
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

// Define the shader code, using GLSL 3.00
import vsGLSL from '../assets/shaders/vs_color.glsl?raw';
import fsGLSL from '../assets/shaders/fs_color.glsl?raw';

const scene = new Scene3D();

// Global variables
let colorProgramInfo = undefined;
let gl = undefined;
const duration = 1000; // ms
let elapsed = 0;
let then = 0;


// Main function is async to be able to make the requests
async function main() {
    // Setup the canvas area
    const canvas = document.querySelector('canvas');
    gl = canvas.getContext('webgl2');
    twgl.resizeCanvasToDisplaySize(gl.canvas);
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);

    // Prepare the program with the shaders
    colorProgramInfo = twgl.createProgramInfo(gl, [vsGLSL, fsGLSL]);

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
    setupObjects(scene, gl, colorProgramInfo);

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

function setupObjects(scene, gl, programInfo) {
    // Create VAOs for the different shapes
    const baseCube = new Object3D(-1);
    baseCube.prepareVAO(gl, programInfo);

    // Add roads to the scene
    for (const road of roads) {
        road.arrays = baseCube.arrays;
        road.bufferInfo = baseCube.bufferInfo;
        road.vao = baseCube.vao;
        road.scale = { x: 0.5, y: 0.1, z: 0.5 };
        scene.addObject(road);
    }

    // Add obstacles to the scene
    for (const obstacle of obstacles) {
        obstacle.arrays = baseCube.arrays;
        obstacle.bufferInfo = baseCube.bufferInfo;
        obstacle.vao = baseCube.vao;
        obstacle.scale = { x: 0.5, y: 0.5, z: 0.5 };
        scene.addObject(obstacle);
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

// Draw an object with its corresponding transformations
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

    // Create the composite matrix with all transformations
    let transforms = M4.identity();
    transforms = M4.multiply(scaMat, transforms);
    transforms = M4.multiply(rotXMat, transforms);
    transforms = M4.multiply(rotYMat, transforms);
    transforms = M4.multiply(rotZMat, transforms);
    transforms = M4.multiply(traMat, transforms);

    object.matrix = transforms;

    // Apply the projection to the final matrix
    const wvpMat = M4.multiply(viewProjectionMatrix, transforms);

    // Model uniforms
    let objectUniforms = {
        u_transforms: wvpMat,
        u_color: object.color
    }
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

    // Draw the objects
    gl.useProgram(colorProgramInfo.program);
    for (let object of scene.objects) {
        drawObject(gl, colorProgramInfo, object, viewProjectionMatrix, fract);
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

// Setup UI
function setupUI() {
    // Could add GUI controls for traffic simulation here
    console.log("Traffic visualization initialized");
}

main();
