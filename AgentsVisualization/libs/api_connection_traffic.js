/*
 * Functions to connect to the Traffic Model API
 *
 * Traffic Base Model - City Simulation
 */

'use strict';

import { Object3D } from '../libs/object3d';

// Define the agent server URI
const agent_server_uri = "http://localhost:8585/";

// Initialize arrays to store different types of agents
const cars = [];
const obstacles = [];
const trafficLights = [];
const roads = [];
const destinations = [];


// Define the data object
const initData = {
    NAgents: 5,  // Number of cars in the simulation
};




/**
 * Initializes the traffic model by sending a POST request to the server.
 */
async function initTrafficModel() {
    try {
        let response = await fetch(agent_server_uri + "init", {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(initData)
        });

        if (response.ok) {
            let result = await response.json();
            console.log(result.message);
        }

    } catch (error) {
        console.log(error);
    }
}

/**
 * Retrieves the current positions of all cars from the server.
 */
async function getCars() {
    try {
        let response = await fetch(agent_server_uri + "getCars");

        if (response.ok) {
            let result = await response.json();

            // Obtener IDs de coches actuales del servidor
            const serverCarIds = new Set(result.positions.map(car => car.id));

            // Eliminar coches que ya no estan en el servidor
            for (let i = cars.length - 1; i >= 0; i--) {
                if (!serverCarIds.has(cars[i].id)) {
                    console.log(`Car ${cars[i].id} reached destination - removing from array`);
                    cars.splice(i, 1);
                }
            }

            for (const car of result.positions) {
                const current_car = cars.find((object3d) => object3d.id == car.id);

                if (current_car != undefined) {
                    // Triple buffering: old <- current, current <- new, future from server
                    current_car.oldPosArray = current_car.posArray;
                    current_car.position = { x: car.x, y: car.y, z: car.z };
                    current_car.direction = car.direction;
                    // Store future position for smoother interpolation
                    current_car.futurePos = { x: car.futureX, y: car.y, z: car.futureZ };
                } else {
                    // Coche nuevo: agregar al array
                    const newCar = new Object3D(car.id, [car.x, car.y, car.z]);
                    newCar['oldPosArray'] = newCar.posArray;
                    newCar['direction'] = car.direction;
                    // Initialize future position same as current
                    newCar['futurePos'] = { x: car.futureX, y: car.y, z: car.futureZ };
                    newCar.color = [1.0, 0.0, 0.0, 1.0];
                    cars.push(newCar);
                }
            }
        }

    } catch (error) {
        console.log(error);
    }
}

/**
 * Retrieves the current positions of all obstacles from the server.
 */
async function getObstacles() {
    try {
        let response = await fetch(agent_server_uri + "getObstacles");

        if (response.ok) {
            let result = await response.json();

            for (const obstacle of result.positions) {
                const newObstacle = new Object3D(obstacle.id, [obstacle.x, obstacle.y, obstacle.z]);
                newObstacle.color = [0.3, 0.3, 0.3, 1.0]; // Dark gray for obstacles
                obstacles.push(newObstacle);
            }
        }

    } catch (error) {
        console.log(error);
    }
}

/**
 * Retrieves the current positions and states of all traffic lights.
 */
async function getTrafficLights() {
    try {
        let response = await fetch(agent_server_uri + "getTrafficLights");

        if (response.ok) {
            let result = await response.json();

            if (trafficLights.length == 0) {
                for (const light of result.positions) {
                    const newLight = new Object3D(light.id, [light.x, light.y, light.z]);
                    newLight['state'] = light.state;
                    newLight.color = light.state ? [0.0, 1.0, 0.0, 1.0] : [1.0, 0.0, 0.0, 1.0];
                    trafficLights.push(newLight);
                }
            } else {
                for (const light of result.positions) {
                    const current_light = trafficLights.find((object3d) => object3d.id == light.id);

                    if (current_light != undefined) {
                        current_light.state = light.state;
                        current_light.color = light.state ? [0.0, 1.0, 0.0, 1.0] : [1.0, 0.0, 0.0, 1.0];
                    }
                }
            }
        }

    } catch (error) {
        console.log(error);
    }
}

/**
 * Retrieves all road positions.
 */
async function getRoads() {
    try {
        let response = await fetch(agent_server_uri + "getRoads");

        if (response.ok) {
            let result = await response.json();

            for (const road of result.positions) {
                const newRoad = new Object3D(road.id, [road.x, road.y, road.z]);
                newRoad['direction'] = road.direction;
                newRoad.color = [0.6, 0.6, 0.6, 1.0]; // Light gray for roads
                roads.push(newRoad);
            }
        }

    } catch (error) {
        console.log(error);
    }
}

/**
 * Retrieves all destination positions.
 */
async function getDestinations() {
    try {
        let response = await fetch(agent_server_uri + "getDestinations");

        if (response.ok) {
            let result = await response.json();

            for (const dest of result.positions) {
                const newDest = new Object3D(dest.id, [dest.x, dest.y, dest.z]);
                newDest.color = [0.0, 1.0, 0.0, 1.0]; // Green for destinations
                destinations.push(newDest);
            }
        }

    } catch (error) {
        console.log(error);
    }
}

/**
 * Updates the traffic model by sending a request to the server.
 */
async function update() {
    try {
        let response = await fetch(agent_server_uri + "update");

        if (response.ok) {
            await getCars();
            await getTrafficLights();
        }

    } catch (error) {
        console.log(error);
    }
}

export {
    cars,
    obstacles,
    trafficLights,
    roads,
    destinations,
    initTrafficModel,
    update,
    getCars,
    getObstacles,
    getTrafficLights,
    getRoads,
    getDestinations
};
