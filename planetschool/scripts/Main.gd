extends Node
## Entry point: creates the world renderer and the UI layer.

func _ready() -> void:
	var world := Node2D.new()
	world.set_script(load("res://scripts/World.gd"))
	world.name = "World"
	add_child(world)
	var ui := CanvasLayer.new()
	ui.set_script(load("res://scripts/UI.gd"))
	ui.name = "UI"
	ui.world = world
	add_child(ui)
