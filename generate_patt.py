from PIL import Image

def generate_patt(img_path, patt_path):
    img = Image.open(img_path).convert('L')
    w, h = img.size
    
    # ARToolKit pattern files represent ONLY the interior region inside the black border.
    # For a standard 50% border ratio (pattRatio = 0.50), crop the inner 50% box:
    margin_x = int(w * 0.25)
    margin_y = int(h * 0.25)
    inner = img.crop((margin_x, margin_y, w - margin_x, h - margin_y))
    inner_resized = inner.resize((16, 16))
    
    orientations = []
    # ARToolKit pattern format requires 4 rotation channels: 0, 270, 180, 90 degrees
    for angle in [0, 270, 180, 90]:
        rotated = inner_resized.rotate(angle)
        pixels = list(rotated.getdata())
        
        lines = []
        for y in range(16):
            row = []
            for x in range(16):
                val = pixels[y * 16 + x]
                row.extend([f"{val:3d}", f"{val:3d}", f"{val:3d}"])
            lines.append("  ".join(row))
        orientations.append("\n".join(lines))
    
    with open(patt_path, "w") as f:
        f.write("\n\n".join(orientations) + "\n")

    print(f"Successfully generated inner-pattern {patt_path} from {img_path}")

if __name__ == '__main__':
    generate_patt('marker.png', 'marker.patt')
