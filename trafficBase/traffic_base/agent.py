from mesa.discrete_space import CellAgent, FixedAgent
from collections import deque

class Car(CellAgent):
    """
    Agent that represents a car in traffic simulation.
    Cars move following road directions and respect traffic lights.
    """
    def __init__(self, model, cell, destination):
        """
        Creates a new car agent.
        Args:
            model: Model reference for the agent
            cell: The initial position of the agent
            destination: The destination cell this car is heading to (required)
        """
        super().__init__(model)
        self.cell = cell
        self.direction = None  # Will store the car's current direction
        self.destination = destination  # The assigned destination for this car
        self.route = []  # The planned route to the destination

        # Subsumption architecture state variables
        self.stuck_counter = 0  # How many steps the car has been stuck
        self.stuck_threshold = 5  # Steps before considering stuck
        self.last_cell = None  # Track last position to detect if stuck

        # Calculate route when car is created
        self.calculate_route()

    def are_directions_compatible(self, dir1, dir2):
        """Check if two directions are compatible (not opposite)."""
        if dir1 is None or dir2 is None:
            return True

        opposite_pairs = [
            ("Up", "Down"),
            ("Down", "Up"),
            ("Left", "Right"),
            ("Right", "Left")
        ]

        return (dir1, dir2) not in opposite_pairs

    def calculate_route(self):
        """Calculate the route from current position to destination using BFS."""
        # BFS to find path - now tracking direction to avoid opposite transitions
        # Queue: (cell, path, last_valid_direction)
        initial_direction = self.get_road_direction()
        queue = deque([(self.cell, [self.cell], initial_direction)])
        visited = {self.cell}

        while queue:
            current_cell, path, path_direction = queue.popleft()

            # If we reached the destination, save the route
            if current_cell == self.destination:
                self.route = path[1:]  # Exclude current cell
                return

            # Get the direction of the current cell
            cell_direction = None
            for agent in current_cell.agents:
                if isinstance(agent, Road):
                    cell_direction = agent.direction
                    break

            # Use the cell's direction if available, otherwise keep the path direction
            # This is critical for traffic lights and destinations that don't have direction
            effective_direction = cell_direction if cell_direction is not None else path_direction

            # If no road direction, this might be a traffic light or destination
            # Check adjacent cells to continue
            x, y = current_cell.coordinate
            width, height = self.model.grid.dimensions

            # Define possible moves based on EFFECTIVE direction (maintains direction through semaphores)
            # Can move forward or change lanes (perpendicular), but CANNOT move in opposite direction
            if effective_direction == "Up":
                # Can move Up (forward), Left or Right (lane change), NOT Down (opposite)
                next_positions = [(x, y + 1), (x - 1, y), (x + 1, y)]
            elif effective_direction == "Down":
                # Can move Down (forward), Left or Right (lane change), NOT Up (opposite)
                next_positions = [(x, y - 1), (x - 1, y), (x + 1, y)]
            elif effective_direction == "Right":
                # Can move Right (forward), Up or Down (lane change), NOT Left (opposite)
                next_positions = [(x + 1, y), (x, y + 1), (x, y - 1)]
            elif effective_direction == "Left":
                # Can move Left (forward), Up or Down (lane change), NOT Right (opposite)
                next_positions = [(x - 1, y), (x, y + 1), (x, y - 1)]
            else:
                # No direction available, try all adjacent cells (shouldn't happen often)
                next_positions = [(x, y + 1), (x, y - 1), (x + 1, y), (x - 1, y)]

            # Explore next positions
            for next_x, next_y in next_positions:
                if 0 <= next_x < width and 0 <= next_y < height:
                    next_cell = self.model.grid[(next_x, next_y)]

                    if next_cell in visited:
                        continue

                    # Check if the cell is accessible (has a road, traffic light, or is destination)
                    is_accessible = False
                    next_cell_direction = None

                    for agent in next_cell.agents:
                        if isinstance(agent, (Road, Traffic_Light, Destination)):
                            is_accessible = True
                            if isinstance(agent, Road):
                                next_cell_direction = agent.direction
                            break

                    # Verify the next cell's direction is compatible with EFFECTIVE direction (not opposite)
                    # This ensures we don't go from Down to Up even through a semaphore
                    if is_accessible and self.are_directions_compatible(effective_direction, next_cell_direction):
                        visited.add(next_cell)
                        # Pass the next cell's direction if it has one, otherwise keep effective direction
                        next_path_direction = next_cell_direction if next_cell_direction is not None else effective_direction
                        queue.append((next_cell, path + [next_cell], next_path_direction))

        # If no route found, route remains empty
        self.route = []

    def get_road_direction(self):
        """Get the direction of the road in the current cell."""
        # First check if there's a road in current cell
        for agent in self.cell.agents:
            if isinstance(agent, Road):
                return agent.direction
        # If no road (e.g., in a traffic light cell), use the car's remembered direction
        return self.direction

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

    def has_green_light_at_cell(self, cell):
        """Check if there's a traffic light in the given cell and if it's green."""
        for agent in cell.agents:
            if isinstance(agent, Traffic_Light):
                # Traffic light exists, check if it's green (state = True)
                return agent.state
        # No traffic light, can proceed
        return True

    def can_exit_current_cell(self):
        """Check if car can exit current cell (for traffic lights in current position)."""
        # If current cell has a red traffic light, car cannot exit
        for agent in self.cell.agents:
            if isinstance(agent, Traffic_Light):
                if not agent.state:  # Red light
                    return False
        return True

    def is_at_destination(self):
        """Check if the car has reached its assigned destination."""
        return self.cell == self.destination

    def get_direction_to_destination(self):
        """Calculate which direction would move the car closer to its destination."""
        current_x, current_y = self.cell.coordinate
        dest_x, dest_y = self.destination.coordinate

        # Determine if we need to move more in X or Y direction
        delta_x = dest_x - current_x
        delta_y = dest_y - current_y

        # Return the direction that moves us closer to destination
        # Prioritize the axis with greater distance
        if abs(delta_x) > abs(delta_y):
            if delta_x > 0:
                return "Right"
            else:
                return "Left"
        else:
            if delta_y > 0:
                return "Up"
            else:
                return "Down"

    def get_adjacent_cells(self):
        """Get all adjacent cells (for lane changing)."""
        x, y = self.cell.coordinate
        width, height = self.model.grid.dimensions

        adjacent = []
        # Check all 4 adjacent cells (not diagonal)
        for dx, dy in [(0, 1), (0, -1), (1, 0), (-1, 0)]:
            new_x, new_y = x + dx, y + dy
            if 0 <= new_x < width and 0 <= new_y < height:
                adjacent.append(self.model.grid[(new_x, new_y)])

        return adjacent

    def try_lane_change(self):
        """Try to change lanes to get closer to destination."""
        desired_direction = self.get_direction_to_destination()

        # Check adjacent cells for a better lane
        for adj_cell in self.get_adjacent_cells():
            # Check if we can move to this cell
            if not self.can_move_to_cell(adj_cell):
                continue

            # Check if there's a green light (or no light) in adjacent cell
            if not self.has_green_light_at_cell(adj_cell):
                continue

            # Check if this cell has a road
            road_dir = None
            for agent in adj_cell.agents:
                if isinstance(agent, Road):
                    road_dir = agent.direction
                    break

            # If the adjacent cell's direction is better for reaching destination, change lanes
            if road_dir == desired_direction:
                self.cell = adj_cell
                self.direction = road_dir
                return True

        return False

    def get_next_cell_direction(self, cell):
        """Get the direction of the road in the given cell."""
        for agent in cell.agents:
            if isinstance(agent, Road):
                return agent.direction
        return None

    def is_stuck(self):
        """Check if the car is stuck (hasn't moved for several steps)."""
        return self.stuck_counter >= self.stuck_threshold

    def get_movement_direction(self, from_cell, to_cell):
        """Calculate the direction of movement between two cells."""
        fx, fy = from_cell.coordinate
        tx, ty = to_cell.coordinate

        if tx > fx:
            return "Right"
        elif tx < fx:
            return "Left"
        elif ty > fy:
            return "Up"
        elif ty < fy:
            return "Down"
        return None

    def try_alternative_lane(self):
        """
        SUBSUMPTION BEHAVIOR: Try to find an alternative lane to avoid traffic.
        This is triggered when the car is stuck.
        """
        if not self.route or len(self.route) == 0:
            return False

        current_direction = self.get_road_direction()
        if current_direction is None:
            return False

        # Check adjacent cells for an alternative lane
        for adj_cell in self.get_adjacent_cells():
            # Calculate the direction of the movement itself
            movement_direction = self.get_movement_direction(self.cell, adj_cell)

            # CRITICAL: Don't move in opposite direction to current direction
            if not self.are_directions_compatible(current_direction, movement_direction):
                continue

            # Skip if cell is blocked
            if not self.can_move_to_cell(adj_cell):
                continue

            # Get direction of adjacent cell
            adj_direction = self.get_next_cell_direction(adj_cell)

            # Only change lanes if destination cell direction is compatible
            if not self.are_directions_compatible(current_direction, adj_direction):
                continue

            # Check if this lane leads closer to destination
            if adj_direction is not None:
                # Move to alternative lane
                self.cell = adj_cell
                self.direction = adj_direction

                # Recalculate route from new position
                self.calculate_route()
                self.stuck_counter = 0  # Reset stuck counter
                return True

        return False

    def step(self):
        """
        Subsumption Architecture for decision making:
        Higher priority behaviors can suppress lower priority ones.

        Priority hierarchy:
        1. Goal achievement (reach destination)
        2. Traffic jam avoidance (find alternative route when stuck)
        3. Safety (no opposite direction)
        4. Traffic rules (respect lights)
        5. Collision avoidance
        6. Route following
        """
        # PRIORITY 1: Goal Achievement - If at destination, remove car
        if self.is_at_destination():
            self.remove()
            return

        # PRIORITY 2: Traffic Rules - Check if can exit current cell (traffic light)
        # Cars can ENTER cells with red lights, but cannot EXIT until green
        if not self.can_exit_current_cell():
            self.stuck_counter += 1
            return

        # Track if car moved to detect stuck state
        previous_cell = self.cell

        # If no route or route is empty, try to move forward in current direction
        if not self.route:
            # Fallback: move in current road direction
            direction = self.get_road_direction()
            if direction is None:
                return

            self.direction = direction
            next_pos = self.get_next_position(direction)

            if next_pos is None:
                return

            width, height = self.model.grid.dimensions
            x, y = next_pos

            if x < 0 or x >= width or y < 0 or y >= height:
                self.remove()
                return

            next_cell = self.model.grid[next_pos]

            # Can enter any cell (including red lights)
            if self.can_move_to_cell(next_cell):
                self.cell = next_cell
            return

        # PRIORITY 3: Traffic Jam Avoidance - If stuck, try alternative lane
        if self.is_stuck():
            if self.try_alternative_lane():
                # Successfully changed to alternative lane
                return

        # Follow the planned route
        next_cell = self.route[0]

        # PRIORITY 4: Safety - Never move to opposite direction
        current_direction = self.get_road_direction()
        next_cell_direction = self.get_next_cell_direction(next_cell)

        if not self.are_directions_compatible(current_direction, next_cell_direction):
            # Route is invalid, recalculate
            self.calculate_route()
            self.stuck_counter += 1
            return

        # PRIORITY 5: Collision Avoidance - Check if cell is blocked
        if not self.can_move_to_cell(next_cell):
            # Cell is blocked, wait
            self.stuck_counter += 1
            return

        # PRIORITY 6: Route Following - All checks passed, move to next cell
        self.cell = next_cell
        self.route.pop(0)  # Remove the cell we just moved to from the route

        # Update direction based on current road
        direction = self.get_road_direction()
        if direction is not None:
            self.direction = direction

        # Check if car actually moved
        if self.cell == previous_cell:
            self.stuck_counter += 1
        else:
            self.stuck_counter = 0  # Reset counter if moved successfully

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
        self.counter = 0  # Internal counter for this traffic light

    def step(self):
        """
        To change the state (green or red) of the traffic light in case you consider the time to change of each traffic light.
        """
        self.counter += 1
        if self.counter >= self.timeToChange:
            self.state = not self.state
            self.counter = 0  # Reset counter

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
