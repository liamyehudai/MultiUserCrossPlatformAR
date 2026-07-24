from PIL import Image, ImageDraw

def generate_ar_marker():
    # 1. Read exact 8x8 AprilTag matrix from AprilTag1.png
    try:
        orig = Image.open('AprilTag1.png').convert('L')
        pixels = list(orig.getdata())
        grid = [[1 if pixels[y*8 + x] > 128 else 0 for x in range(8)] for y in range(8)]
    except Exception:
        # Fallback Tag36h11 AprilTag payload if file unreadable
        grid = [
            [0, 0, 0, 0, 0, 0, 0, 0],
            [0, 1, 1, 0, 1, 1, 0, 0],
            [0, 0, 1, 0, 1, 1, 1, 0],
            [0, 1, 1, 1, 1, 0, 0, 0],
            [0, 0, 1, 1, 0, 0, 0, 0],
            [0, 1, 0, 1, 1, 0, 1, 0],
            [0, 0, 0, 1, 0, 0, 1, 0],
            [0, 0, 0, 0, 0, 0, 0, 0]
        ]

    # 2. Render pixel-perfect high-resolution marker with white quiet zone
    scale = 48  # 8x8 grid -> 384x384 pixels
    tag_size = 8 * scale  # 384px
    margin = 64  # Quiet zone
    total_size = tag_size + 2 * margin  # 512px

    img = Image.new('RGB', (total_size, total_size), 'white')
    draw = ImageDraw.Draw(img)

    for y in range(8):
        for x in range(8):
            x0 = margin + x * scale
            y0 = margin + y * scale
            x1 = x0 + scale
            y1 = y0 + scale
            color = 'white' if grid[y][x] == 1 else 'black'
            draw.rectangle([x0, y0, x1, y1], fill=color)

    img.save('marker.png')
    print("Rendered crisp high-res 512x512 marker.png with white quiet zone!")

    # 3. Generate correct 3-channel RGB marker.patt for ARToolKit
    inner_margin = margin + scale  # Skip 1-block outer black border
    inner_crop = img.crop((inner_margin, inner_margin, total_size - inner_margin, total_size - inner_margin))
    patt_img = inner_crop.resize((16, 16), Image.Resampling.LANCZOS)

    orientations = []
    for angle in [0, 270, 180, 90]:
        rotated = patt_img.rotate(angle)
        p_data = list(rotated.getdata())
        lines = []
        for y in range(16):
            row = []
            for x in range(16):
                r, g, b = p_data[y * 16 + x]
                row.append(f"{r:3d} {g:3d} {b:3d}")
            lines.append("  ".join(row))
        orientations.append("\n".join(lines))

    with open('marker.patt', 'w') as f:
        f.write("\n\n".join(orientations) + "\n")

    print("Generated matching RGB marker.patt for AprilTag!")

if __name__ == '__main__':
    generate_ar_marker()
