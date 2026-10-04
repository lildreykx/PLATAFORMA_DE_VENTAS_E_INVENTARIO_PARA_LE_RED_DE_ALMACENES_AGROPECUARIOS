CREATE DATABASE AgroUraba;
GO

USE AgroUraba;
GO

CREATE TABLE Inventario (
    id INT IDENTITY(1,1) PRIMARY KEY,
    name NVARCHAR(200) NOT NULL,
    price DECIMAL(18,2) NOT NULL,
    stock INT NOT NULL,
    minStock INT NOT NULL,
    lot NVARCHAR(100) NULL,
    exp DATE NULL,
    branch NVARCHAR(100) NOT NULL
);
GO

CREATE TABLE Ventas (
    id NVARCHAR(50) PRIMARY KEY,
    detalle NVARCHAR(500) NOT NULL,
    total DECIMAL(18,2) NOT NULL,
    fecha DATETIME NOT NULL DEFAULT GETDATE(),
    factura NVARCHAR(MAX) NULL
);
GO

IF COL_LENGTH('dbo.Ventas', 'factura') IS NULL
    ALTER TABLE dbo.Ventas ADD factura NVARCHAR(MAX) NULL;
GO

INSERT INTO Inventario (name, price, stock, minStock, lot, exp, branch)
VALUES
('Fertilizante Úrea 46%', 120000, 15, 10, 'UT-9921', '2027-05-12', 'Apartadó'),
('Agroquímico BananoProtect', 85000, 4, 8, 'BP-8812', '2026-11-30', 'Chigorodó'),
('Abono Complejo NPK', 140000, 2, 5, 'NPK-001', '2028-01-15', 'Apartadó'),
('Fungicida Agrícola Premium', 95000, 0, 5, 'FG-4401', '2026-12-01', 'Chigorodó');
GO

INSERT INTO Inventario (name, price, stock, minStock, lot, exp, branch)
SELECT source.name, source.price, 0, source.minStock, 'POR-RECIBIR', NULL, 'Apartadó'
FROM (VALUES
    (N'Urea Precisagro 46% x 50 kg', 124000, 5),
    (N'Nutrimon NPK 10-20-20 x 50 kg', 253200, 5),
    (N'Agrimins 8-5-0-6 Colinagro x 46 kg', 162000, 5),
    (N'Nutrimon Producción 17-6-18-2 x 50 kg', 170900, 5),
    (N'Banagen 250 EC x 250 ml', 26000, 2)
) AS source(name, price, minStock)
WHERE NOT EXISTS (
    SELECT 1 FROM Inventario existing WHERE existing.name = source.name
);
GO
