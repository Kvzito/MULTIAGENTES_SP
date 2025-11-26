from mesa.discrete_space import CellAgent, FixedAgent

class Car(CellAgent):
    """
    Agent that represents a car in traffic simulation.
    Cars move following road directions and respect traffic lights.
    """
    def __init__(self, model, cell):
        """
        Creates a new car agent.
        Args:
            model: Model reference for the agent
            cell: The initial position of the agent
        """
        super().__init__(model)
        self.cell = cell

    def get_road_direction(self):
        """Get the direction of the road in the current cell."""
        for agent in self.cell.agents:
            if isinstance(agent, Road):
                return agent.direction
        return None

    def get_next_position(self, direction):
        """Calculate next position based on direction."""
        x, y = self.cell.coordinate

        if direction == "Up":
            return (x, y + 1)
        elif direction == "Down":
            return (x, y - 1)
        elif direction == "Right":
            return (x + 1, y)
        elif direction == "Left":
            return (x - 1, y)

        return None

    def can_move_to_cell(self, cell):
        """Check if the car can move to the given cell."""
        if cell is None:
            return False

        # Check if there's another car in the cell
        for agent in cell.agents:
            if isinstance(agent, Car):
                return False

        # Check if there's an obstacle
        for agent in cell.agents:
            if isinstance(agent, Obstacle):
                return False

        return True

    def has_green_light(self):
        """Check if there's a traffic light in current cell and if it's green."""
        for agent in self.cell.agents:
            if isinstance(agent, Traffic_Light):
                # Traffic light exists, check if it's green (state = True)
                return agent.state
        # No traffic light, can proceed
        return True

    def is_at_destination(self):
        """Check if the car has reached a destination."""
        for agent in self.cell.agents:
            if isinstance(agent, Destination):
                return True
        return False

    def step(self):
        """
        Determines the new direction it will take, and then moves
        """
        # If at destination, remove the car from simulation
        if self.is_at_destination():
            self.remove()
            return

        # Check if there's a green light (or no light)
        if not self.has_green_light():
            # Red light, cannot move
            return

        # Get the direction of the current road
        direction = self.get_road_direction()

        if direction is None:
            # Not on a road, shouldn't happen
            return

        # Calculate next position
        next_pos = self.get_next_position(direction)

        if next_pos is None:
            return

        # Check if next position is within grid bounds
        width, height = self.model.grid.dimensions
        x, y = next_pos

        if x < 0 or x >= width or y < 0 or y >= height:
            # Out of bounds, remove car
            self.remove()
            return

        # Get the next cell
        next_cell = self.model.grid[next_pos]

        # Check if can move to next cell
        if self.can_move_to_cell(next_cell):
            # Move to next cell
            self.cell = next_cell

class Traffic_Light(FixedAgent):
    """
    Traffic light. Where the traffic lights are in the grid.
    """
    def __init__(self, model, cell, state = False, timeToChange = 10):
        """
        Creates a new Traffic light.
        Args:
            model: Model reference for the agent
            cell: The initial position of the agent
            state: Whether the traffic light is green or red
            timeToChange: After how many step should the traffic light change color 
        """
        super().__init__(model)
        self.cell = cell
        self.state = state
        self.timeToChange = timeToChange

    def step(self):
        """ 
        To change the state (green or red) of the traffic light in case you consider the time to change of each traffic light.
        """
        if self.model.steps % self.timeToChange == 0:
            self.state = not self.state

class Destination(FixedAgent):
    """
    Destination agent. Where each car should go.
    """
    def __init__(self, model, cell):
        """
        Creates a new destination agent
        Args:
            model: Model reference for the agent
            cell: The initial position of the agent
        """
        super().__init__(model)
        self.cell = cell

class Obstacle(FixedAgent):
    """
    Obstacle agent. Just to add obstacles to the grid.
    """
    def __init__(self, model, cell):
        """
        Creates a new obstacle.
        
        Args:
            model: Model reference for the agent
            cell: The initial position of the agent
        """
        super().__init__(model)
        self.cell = cell

class Road(FixedAgent):
    """
    Road agent. Determines where the cars can move, and in which direction.
    """
    def __init__(self, model, cell, direction= "Left"):
        """
        Creates a new road.
        Args:
            model: Model reference for the agent
            cell: The initial position of the agent
        """
        super().__init__(model)
        self.cell = cell
        self.direction = direction
