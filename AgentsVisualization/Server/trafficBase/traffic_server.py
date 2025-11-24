from flask import Flask, request, jsonify
from flask_cors import CORS, cross_origin
from traffic_base.model import CityModel
from traffic_base.agent import Car, Obstacle, Traffic_Light, Road, Destination

# Model parameters
cityModel = None
currentStep = 0

# Create the Flask application
app = Flask("Traffic Simulation")
cors = CORS(app, origins=['http://localhost'])

@app.route('/init', methods=['GET', 'POST'])
@cross_origin()
def initModel():
    global currentStep, cityModel
    
    if request.method == 'POST':
        try:
            N = int(request.json.get('NAgents', 5))
            currentStep = 0
        except Exception as e:
            print(e)
            return jsonify({"message": "Error initializing the model"}), 500
    else:
        N = 5
    
    print(f"Model parameters: N={N}")
    
    # Create the CityModel
    cityModel = CityModel(N)
    
    return jsonify({"message": f"City model initialized with {N} cars."})


@app.route('/getAgents', methods=['GET'])
@cross_origin()
def getAgents():
    global cityModel
    
    if request.method == 'GET':
        try:
            # Get all Car agents
            agentCells = cityModel.grid.all_cells.select(
                lambda cell: any(isinstance(obj, Car) for obj in cell.agents)
            ).cells
            
            agents = [
                (cell.coordinate, agent)
                for cell in agentCells
                for agent in cell.agents
                if isinstance(agent, Car)
            ]
            
            agentPositions = [
                {"id": str(a.unique_id), "x": coordinate[0], "y": 1, "z": coordinate[1]}
                for (coordinate, a) in agents
            ]
            
            return jsonify({'positions': agentPositions})
        except Exception as e:
            print(e)
            return jsonify({"message": "Error with the agent positions"}), 500


@app.route('/getObstacles', methods=['GET'])
@cross_origin()
def getObstacles():
    global cityModel
    
    if request.method == 'GET':
        try:
            # Get all Obstacle agents
            obstacleCells = cityModel.grid.all_cells.select(
                lambda cell: any(isinstance(obj, Obstacle) for obj in cell.agents)
            )
            
            agents = [
                (cell.coordinate, agent)
                for cell in obstacleCells
                for agent in cell.agents
                if isinstance(agent, Obstacle)
            ]
            
            obstaclePositions = [
                {"id": str(a.unique_id), "x": coordinate[0], "y": 1, "z": coordinate[1]}
                for (coordinate, a) in agents
            ]
            
            return jsonify({'positions': obstaclePositions})
        except Exception as e:
            print(e)
            return jsonify({"message": "Error with obstacle positions"}), 500


@app.route('/getTrafficLights', methods=['GET'])
@cross_origin()
def getTrafficLights():
    global cityModel
    
    if request.method == 'GET':
        try:
            # Get all Traffic_Light agents
            trafficLightCells = cityModel.grid.all_cells.select(
                lambda cell: any(isinstance(obj, Traffic_Light) for obj in cell.agents)
            )
            
            agents = [
                (cell.coordinate, agent)
                for cell in trafficLightCells
                for agent in cell.agents
                if isinstance(agent, Traffic_Light)
            ]
            
            trafficLightPositions = [
                {
                    "id": str(a.unique_id), 
                    "x": coordinate[0], 
                    "y": 1, 
                    "z": coordinate[1],
                    "state": a.state
                }
                for (coordinate, a) in agents
            ]
            
            return jsonify({'positions': trafficLightPositions})
        except Exception as e:
            print(e)
            return jsonify({"message": "Error with traffic light positions"}), 500


@app.route('/getRoads', methods=['GET'])
@cross_origin()
def getRoads():
    global cityModel
    
    if request.method == 'GET':
        try:
            # Get all Road agents
            roadCells = cityModel.grid.all_cells.select(
                lambda cell: any(isinstance(obj, Road) for obj in cell.agents)
            )
            
            agents = [
                (cell.coordinate, agent)
                for cell in roadCells
                for agent in cell.agents
                if isinstance(agent, Road)
            ]
            
            roadPositions = [
                {
                    "id": str(a.unique_id), 
                    "x": coordinate[0], 
                    "y": 1, 
                    "z": coordinate[1],
                    "direction": a.direction
                }
                for (coordinate, a) in agents
            ]
            
            return jsonify({'positions': roadPositions})
        except Exception as e:
            print(e)
            return jsonify({"message": "Error with road positions"}), 500


@app.route('/getDestinations', methods=['GET'])
@cross_origin()
def getDestinations():
    global cityModel
    
    if request.method == 'GET':
        try:
            # Get all Destination agents
            destinationCells = cityModel.grid.all_cells.select(
                lambda cell: any(isinstance(obj, Destination) for obj in cell.agents)
            )
            
            agents = [
                (cell.coordinate, agent)
                for cell in destinationCells
                for agent in cell.agents
                if isinstance(agent, Destination)
            ]
            
            destinationPositions = [
                {"id": str(a.unique_id), "x": coordinate[0], "y": 1, "z": coordinate[1]}
                for (coordinate, a) in agents
            ]
            
            return jsonify({'positions': destinationPositions})
        except Exception as e:
            print(e)
            return jsonify({"message": "Error with destination positions"}), 500


@app.route('/update', methods=['GET'])
@cross_origin()
def updateModel():
    global currentStep, cityModel
    if request.method == 'GET':
        try:
            cityModel.step()
            currentStep += 1
            return jsonify({'message': f'Model updated to step {currentStep}.', 'currentStep': currentStep})
        except Exception as e:
            print(e)
            return jsonify({"message": "Error during step."}), 500


if __name__ == '__main__':
    app.run(host="localhost", port=8585, debug=True)
