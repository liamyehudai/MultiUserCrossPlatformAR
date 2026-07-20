import math
from PIL import Image, ImageDraw

def generate_ar_marker():
    size = 512
    img = Image.new('RGB', (size, size), 'white')
    draw = ImageDraw.Draw(img)
    
    # Outer thick black frame
    border = 32
    draw.rectangle([border, border, size - border, size - border], outline='black', width=24)
    
    # Inner decorative grid & high-contrast feature points
    center = size // 2
    
    # Corner alignment boxes (asymmetric so orientation is unambiguous)
    # Top-left box
    draw.rectangle([64, 64, 144, 144], fill='black')
    draw.rectangle([84, 84, 124, 124], fill='white')
    draw.rectangle([96, 96, 112, 112], fill='black')
    
    # Top-right box
    draw.rectangle([368, 64, 448, 144], fill='black')
    draw.rectangle([388, 84, 428, 124], fill='white')
    
    # Bottom-left box
    draw.rectangle([64, 368, 144, 448], fill='black')
    draw.rectangle([84, 388, 124, 428], fill='white')
    
    # Bottom-right pattern (circle combination for high feature gradient)
    draw.ellipse([368, 368, 448, 448], fill='black')
    draw.ellipse([392, 392, 424, 424], fill='white')
    draw.ellipse([402, 402, 414, 414], fill='black')

    # Central high-contrast emblem (nested rotated squares & crosshair)
    draw.rectangle([center - 90, center - 90, center + 90, center + 90], outline='black', width=12)
    draw.rectangle([center - 60, center - 60, center + 60, center + 60], fill='black')
    draw.rectangle([center - 35, center - 35, center + 35, center + 35], fill='white')
    draw.rectangle([center - 15, center - 15, center + 15, center + 15], fill='black')
    
    # Crosshair bars
    draw.line([center, border, center, size - border], fill='black', width=6)
    draw.line([border, center, size - border, center], fill='black', width=6)
    
    # Diagonal high contrast dots
    dots = [(180, 180), (332, 180), (180, 332), (332, 332)]
    for dx, dy in dots:
        draw.ellipse([dx - 16, dy - 16, dx + 16, dy + 16], fill='black')
        draw.ellipse([dx - 6, dy - 6, dx + 6, dy + 6], fill='white')

    img.save('marker.png')
    print("marker.png generated successfully!")

if __name__ == '__main__':
    generate_ar_marker()
