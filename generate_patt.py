from PIL import Image

def generate_patt(img_path, patt_path):
    # Open image, convert to RGB, resize to 16x16 pattern grid
    img = Image.open(img_path).convert('RGB').resize((16, 16))
    
    orientations = []
    # ARToolKit pattern format requires 4 rotation matrices: 0, 90, 180, 270 degrees
    for angle in [0, 270, 180, 90]:
        rotated = img.rotate(angle)
        pixels = list(rotated.getdata())
        
        # Form 3 channel matrices (R, G, B) of 16 lines x 16 integers
        lines = []
        for c in range(3):
            for y in range(16):
                row = [f"{pixels[y * 16 + x][c]:3d}" for x in range(16)]
                lines.append(" ".join(row))
        orientations.append("\n".join(lines))
    
    with open(patt_path, "w") as f:
        f.write("\n\n".join(orientations) + "\n")

    print(f"Successfully generated {patt_path} from {img_path}")

if __name__ == '__main__':
    generate_patt('marker.png', 'marker.patt')
