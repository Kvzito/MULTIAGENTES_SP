from mesa import Model
from mesa.discrete_space import OrthogonalMooreGrid
from mesa.datacollection import DataCollector
from .agent import *
import json


class CityModel(Model):
    """
    Creates a model based on a city map.

    Args:
        N: Number of agents in the simulation
        seed: Random seed for the model
    """

    def __init__(self, N, seed=42, spawn_interval=1):

        super().__init__(seed=seed)

        # Load the map dictionary. The dictionary maps the characters in the map file to the corresponding agent.
        dataDictionary = json.load(open("city_files/mapDictionary.json"))

        self.num_agents = N
        self.spawn_interval = spawn_interval  # How often to spawn cars (in steps)
        self.traffic_lights = []
        self.spawn_points = []  # Will store the 4 corners as spawn points
        self.destinations = []  # Will store all destination cells

        # Metrics
        self.total_spawned = 0  # Total cars spawned during simulation
        self.total_reached_destination = 0  # Total cars that reached destination
        self.current_active_cars = 0  # Current number of cars in simulation

        # Data collector for visualization
        self.datacollector = DataCollector(
            model_reporters={
                "Total Spawneados": lambda m: m.total_spawned,
                "Llegaron a Destino": lambda m: m.total_reached_destination,
                "Activos Actualmente": lambda m: m.current_active_cars,
            }
        )

        # Load the map file. The map file is a text file where each character represents an agent.
        with open("city_files/2025_base.txt") as baseFile:
            lines = baseFile.readlines()
            self.width = len(lines[0].strip())  # Remove newline character
            self.height = len(lines)

            self.grid = OrthogonalMooreGrid(
                [self.width, self.height], capacity=100, torus=False
            )

            # Goes through each character in the map file and creates the corresponding agent.
            for r, row in enumerate(lines):
                for c, col in enumerate(row.strip()):

                    cell = self.grid[(c, self.height - r - 1)]

                    if col in ["v", "^", ">", "<"]:
                        agent = Road(self, cell, dataDictionary[col])

                    elif col in ["S", "s"]:
                        agent = Traffic_Light(
                            self,
                            cell,
                            False if col == "S" else True,
                            int(dataDictionary[col]),
                        )
                        self.traffic_lights.append(agent)

                    elif col == "#":
                        agent = Obstacle(self, cell)

                    elif col == "D":
                        agent = Destination(self, cell)
                        self.destinations.append(cell)

        # Identify the 4 corners as potential spawn points
        corners = [
            (0, self.height - 1),  # Top-left
            (self.width - 1, self.height - 1),  # Top-right
            (0, 0),  # Bottom-left
            (self.width - 1, 0)  # Bottom-right
        ]

        # Check each corner if it has a Road agent
        for corner_pos in corners:
            cell = self.grid[corner_pos]
            # Check if there's a Road agent in this corner
            for agent in cell.agents:
                if isinstance(agent, Road):
                    self.spawn_points.append({
                        'position': corner_pos,
                        'direction': agent.direction,
                        'cell': cell
                    })
                    break

        self.running = True

    def is_cell_available_for_spawn(self, cell):
        """Check if a cell is available to spawn a new car."""
        # A cell is available if it doesn't have any Car agents
        for agent in cell.agents:
            if isinstance(agent, Car):
                return False
        return True

    def spawn_car(self):
        """Spawn cars at ALL available corners simultaneously."""
        # Get available spawn points (corners that are not blocked)
        available_spawns = [
            sp for sp in self.spawn_points
            if self.is_cell_available_for_spawn(sp['cell'])
        ]

        # If no spawn points available, check if all are blocked
        if len(available_spawns) == 0:
            # All corners are blocked, end simulation
            self.running = False
            return

        # Spawn a car at EACH available corner
        for spawn in available_spawns:
            # Randomly choose a destination for this car
            destination = self.random.choice(self.destinations)

            # Create a new car at this spawn point with the assigned destination
            car = Car(self, spawn['cell'], destination)

            # Update metrics
            self.total_spawned += 1
            self.current_active_cars += 1

    def car_reached_destination(self):
        """Called when a car reaches its destination to update metrics."""
        self.total_reached_destination += 1
        self.current_active_cars -= 1

    def get_metrics(self):
        """Return current simulation metrics."""
        return {
            'total_spawned': self.total_spawned,
            'total_reached_destination': self.total_reached_destination,
            'current_active_cars': self.current_active_cars
        }

    def print_metrics(self):
        """Print current simulation metrics."""
        print(f"\n=== Simulation Metrics ===")
        print(f"Total cars spawned: {self.total_spawned}")
        print(f"Total cars reached destination: {self.total_reached_destination}")
        print(f"Current active cars: {self.current_active_cars}")
        print(f"========================\n")

    def step(self):
        """Advance the model by one step."""
        # Execute all agent steps
        self.agents.shuffle_do("step")

        # Spawn new cars based on configured interval
        if self.steps % self.spawn_interval == 0 and self.steps > 0:
            self.spawn_car()

        # Collect data for visualization
        self.datacollector.collect(self)
