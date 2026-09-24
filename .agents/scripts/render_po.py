import fitz, sys
for path in sys.argv[1:]:
    pdf = fitz.open(path)
    print(path, 'pages:', len(pdf), 'text:', pdf[0].get_text()[:300])
    pdf[0].get_pixmap(matrix=fitz.Matrix(2,2)).save(path.replace('.pdf','.png'))
