from PIL import Image

def generate_patt(img_path, patt_path):
    # Open image, convert to Grayscale ('L'), resize to 16x16 template grid
    img = Image.open(img_path).convert('L').resize((16, 16))
    
    orientations = []
    # ARToolKit pattern format requires 4 rotation matrices: 0, 270, 180, 90 degrees
    for angle in [0, 270, 180, 90]:
        rotated = img.rotate(angle)
        pixels = list(rotated.getdata())
        
        lines = []
        for y in range(16):
            row = [f"{pixels[y * 16 + x]:3d}" for x in range(16)]
            lines.append(" ".join(row))
        orientations.append("\n".join(lines))
    
    with open(patt_path, "w") as f:
        f.write("\n\n".join(orientations) + "\n")

    print(f"Successfully generated grayscale {patt_path} from {img_path}")

if __name__ == '__main__':
    generate_patt('marker.png', 'marker.patt')
