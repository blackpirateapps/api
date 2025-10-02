// Configuration object for Phaser game
const config = {
    type: Phaser.AUTO, // Automatically choose WebGL or Canvas
    width: 800,
    height: 600,
    parent: 'game-container',
    backgroundColor: '#5cb85c', // Green grass color
    scene: {
        create: create,
        update: update
    }
};

// Initialize the Phaser game
const game = new Phaser.Game(config);

// Global variables
let tiles = []; // Store tile objects in a 2D array
let coins = 0; // Player's coin counter
let coinText; // Text object to display coins
const GRID_COLS = 10; // Number of columns in the grid
const GRID_ROWS = 8; // Number of rows in the grid
const TILE_SIZE = 70; // Size of each tile in pixels
const OFFSET_X = 50; // Horizontal offset to center the grid
const OFFSET_Y = 100; // Vertical offset from top

// Tree states
const TREE_STATE = {
    EMPTY: 'empty',
    SAPLING: 'sapling',
    GROWN: 'grown'
};

// Create function - runs once when the game starts
function create() {
    // Display coin counter in top-left corner
    coinText = this.add.text(16, 16, 'Coins: 0', {
        fontSize: '28px',
        fill: '#fff',
        fontStyle: 'bold',
        stroke: '#000',
        strokeThickness: 4
    });
    
    // Create the grid of tiles
    for (let row = 0; row < GRID_ROWS; row++) {
        tiles[row] = []; // Initialize row array
        
        for (let col = 0; col < GRID_COLS; col++) {
            // Calculate position for this tile
            const x = OFFSET_X + col * TILE_SIZE;
            const y = OFFSET_Y + row * TILE_SIZE;
            
            // Create a tile object with graphics and state
            const tile = {
                x: x,
                y: y,
                state: TREE_STATE.EMPTY,
                graphics: null, // Will hold the visual representation
                growTimer: null // Will hold the timer for tree growth
            };
            
            // Draw the tile border (darker green square)
            const border = this.add.rectangle(x, y, TILE_SIZE - 4, TILE_SIZE - 4);
            border.setStrokeStyle(2, 0x3d8b3d);
            
            // Make the tile interactive (clickable)
            border.setInteractive();
            border.on('pointerdown', () => handleTileClick(this, tile));
            
            // Store tile in the array
            tiles[row][col] = tile;
        }
    }
}

// Update function - runs every frame (not needed for this simple demo)
function update() {
    // Game loop logic can go here if needed
}

// Handle click on a tile
function handleTileClick(scene, tile) {
    if (tile.state === TREE_STATE.EMPTY) {
        // Plant a sapling
        plantSapling(scene, tile);
    } else if (tile.state === TREE_STATE.GROWN) {
        // Harvest the tree
        harvestTree(scene, tile);
    }
    // If it's a sapling (still growing), do nothing
}

// Plant a sapling on an empty tile
function plantSapling(scene, tile) {
    // Update tile state
    tile.state = TREE_STATE.SAPLING;
    
    // Draw sapling (small brown circle with green top)
    const sapling = scene.add.container(tile.x, tile.y);
    
    // Brown stem
    const stem = scene.add.circle(0, 5, 8, 0x8b4513);
    // Small green leaves
    const leaves = scene.add.circle(0, -5, 12, 0x90ee90);
    
    sapling.add([stem, leaves]);
    tile.graphics = sapling;
    
    // Set timer to grow the tree after 5 seconds
    tile.growTimer = scene.time.delayedCall(5000, () => {
        growTree(scene, tile);
    });
}

// Grow a sapling into a full tree
function growTree(scene, tile) {
    // Remove sapling graphics
    if (tile.graphics) {
        tile.graphics.destroy();
    }
    
    // Update state
    tile.state = TREE_STATE.GROWN;
    
    // Draw grown tree (larger brown trunk with bigger green canopy)
    const tree = scene.add.container(tile.x, tile.y);
    
    // Brown trunk (rectangle)
    const trunk = scene.add.rectangle(0, 5, 15, 30, 0x654321);
    // Large green canopy (circle)
    const canopy = scene.add.circle(0, -15, 25, 0x228b22);
    
    tree.add([trunk, canopy]);
    tile.graphics = tree;
}

// Harvest a grown tree
function harvestTree(scene, tile) {
    // Remove tree graphics
    if (tile.graphics) {
        tile.graphics.destroy();
        tile.graphics = null;
    }
    
    // Reset tile to empty
    tile.state = TREE_STATE.EMPTY;
    
    // Add coin and update display
    coins++;
    coinText.setText('Coins: ' + coins);
    
    // Optional: Add a little visual feedback
    const coinPopup = scene.add.text(tile.x, tile.y, '+1', {
        fontSize: '24px',
        fill: '#ffd700',
        fontStyle: 'bold',
        stroke: '#000',
        strokeThickness: 3
    });
    coinPopup.setOrigin(0.5);
    
    // Animate the popup text (fade out and move up)
    scene.tweens.add({
        targets: coinPopup,
        y: tile.y - 40,
        alpha: 0,
        duration: 1000,
        onComplete: () => {
            coinPopup.destroy();
        }
    });
}