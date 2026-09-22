// Archivo principal del TP 05
// Reservas de salas de estudio. Lo importante de este trabajo es el orden
// del pipeline de middleware, por eso todo queda en un solo archivo.

const path = require("node:path");
const express = require("express");
const expressLayouts = require("express-ejs-layouts");
const morgan = require("morgan");

const app = express();
const PUERTO = 3000;

const salasPermitidas = ["Sala Norte", "Sala Sur", "Sala Multimedia"];
const turnosPermitidos = ["Mañana", "Tarde", "Noche"];

// Los datos viven solo en memoria mientras el servidor esta encendido.
const reservas = [
  {
    id: 1,
    estudiante: "Germán Nieva",
    email: "german.nieva@ejemplo.com",
    sala: "Sala Norte",
    fecha: "2026-09-22",
    turno: "Mañana",
    personas: 3,
  },
  {
    id: 2,
    estudiante: "Camila Ruiz",
    email: "camila.ruiz@ejemplo.com",
    sala: "Sala Multimedia",
    fecha: "2026-09-22",
    turno: "Tarde",
    personas: 5,
  },
  {
    id: 3,
    estudiante: "Marcos Ledesma",
    email: "marcos.ledesma@ejemplo.com",
    sala: "Sala Sur",
    fecha: "2026-09-23",
    turno: "Noche",
    personas: 2,
  },
  {
    id: 4,
    estudiante: "Paula Sosa",
    email: "paula.sosa@ejemplo.com",
    sala: "Sala Norte",
    fecha: "2026-09-24",
    turno: "Tarde",
    personas: 6,
  },
];

// contador que usa identificarSolicitud
let contadorSolicitudes = 0;

// ---------------------------------------------------------------
// Middleware personalizado global
// ---------------------------------------------------------------

// Le pone un numero a cada solicitud: BIB-0001, BIB-0002, BIB-0003...
function identificarSolicitud(req, res, next) {
  contadorSolicitudes = contadorSolicitudes + 1;

  const numero = String(contadorSolicitudes).padStart(4, "0");
  res.locals.solicitudId = "BIB-" + numero;

  next();
}

// Mide cuanto tardo la respuesta. El calculo se hace dentro del evento
// "finish", que se dispara cuando la respuesta ya se termino de enviar.
function medirDuracion(req, res, next) {
  const inicio = Date.now();

  res.on("finish", function () {
    const duracion = Date.now() - inicio;

    console.log(
      res.locals.solicitudId +
        " " +
        req.method +
        " " +
        req.originalUrl +
        " -> " +
        res.statusCode +
        " (" +
        duracion +
        " ms)"
    );
  });

  next();
}

// ---------------------------------------------------------------
// Configuracion de vistas
// ---------------------------------------------------------------

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "..", "views"));

// ---------------------------------------------------------------
// Pipeline global, en este orden
// ---------------------------------------------------------------

app.use(morgan("dev")); // 1. de terceros: registra el pedido en la terminal
app.use(identificarSolicitud); // 2. propio: arma el ID de la solicitud
app.use(medirDuracion); // 3. propio: usa ese ID y mide cuanto tarda
app.use(expressLayouts); // 4. hace que las vistas usen el layout
app.set("layout", "layouts/main");
app.use(express.static(path.join(__dirname, "..", "public"))); // 5. archivos de public
app.use(express.urlencoded({ extended: false })); // 6. arma req.body de los formularios
app.use(express.json()); // 7. arma req.body cuando el cuerpo viene en JSON

// ---------------------------------------------------------------
// Rutas de aplicacion
// ---------------------------------------------------------------

app.get("/", function (req, res) {
  res.render("inicio", {
    titulo: "Reservas de salas de estudio",
    cantidad: reservas.length,
  });
});

// Esta ruta no renderiza vistas ni depende de "seccion": devuelve JSON.
app.get("/estado", function (req, res) {
  res.json({
    servicio: "activo",
    reservas: reservas.length,
    solicitudId: res.locals.solicitudId,
  });
});

// ---------------------------------------------------------------
// Router de reservas
// ---------------------------------------------------------------

const reservasRouter = express.Router();

// Middleware de area: corre solo para lo que cuelga de /reservas.
function prepararAreaReservas(req, res, next) {
  res.locals.seccion = "Reservas de salas";
  next();
}

reservasRouter.use(prepararAreaReservas);

// Listado
reservasRouter.get("/", function (req, res) {
  res.render("reservas/lista", {
    titulo: "Listado de reservas",
    reservas: reservas,
  });
});

// Formulario. Va antes de "/:id" para que la palabra "nueva"
// no se tome como si fuera un id.
reservasRouter.get("/nueva", function (req, res) {
  res.render("reservas/nueva", {
    titulo: "Nueva reserva",
    salas: salasPermitidas,
    turnos: turnosPermitidos,
    error: null,
    valores: valoresVacios(),
  });
});

// Detalle
reservasRouter.get("/:id", function (req, res) {
  const id = Number(req.params.id);
  const reserva = reservas.find(function (item) {
    return item.id === id;
  });

  if (!reserva) {
    res.status(404).render("no-encontrado", {
      titulo: "Reserva no encontrada",
      mensaje: "No existe una reserva con el número " + req.params.id + ".",
    });
    return;
  }

  res.render("reservas/detalle", {
    titulo: "Reserva de " + reserva.estudiante,
    reserva: reserva,
  });
});

// ---------------------------------------------------------------
// Middleware de validacion (solo para el POST)
// ---------------------------------------------------------------

function validarReserva(req, res, next) {
  const estudiante = (req.body.estudiante || "").trim();
  const email = (req.body.email || "").trim();
  const sala = (req.body.sala || "").trim();
  const fecha = (req.body.fecha || "").trim();
  const turno = (req.body.turno || "").trim();
  const personas = Number(req.body.personas);

  // Lo que se le devuelve al formulario si algo sale mal,
  // asi la persona no tiene que escribir todo de nuevo.
  const valores = {
    estudiante: estudiante,
    email: email,
    sala: sala,
    fecha: fecha,
    turno: turno,
    personas: req.body.personas || "",
  };

  let error = null;

  if (
    estudiante === "" ||
    email === "" ||
    sala === "" ||
    fecha === "" ||
    turno === "" ||
    valores.personas === ""
  ) {
    error = "Hay que completar todos los campos.";
  } else if (!salasPermitidas.includes(sala)) {
    error = "Esa sala no está en la lista de salas permitidas.";
  } else if (!turnosPermitidos.includes(turno)) {
    error = "El turno tiene que ser Mañana, Tarde o Noche.";
  } else if (!Number.isInteger(personas) || personas < 1 || personas > 6) {
    error = "La cantidad de personas tiene que ser un número entero del 1 al 6.";
  } else if (!email.includes("@")) {
    error = "El email tiene que tener una arroba.";
  }

  // Camino invalido: responde 400 y ahi termina el ciclo. No llama a next().
  if (error) {
    res.status(400).render("reservas/nueva", {
      titulo: "Nueva reserva",
      salas: salasPermitidas,
      turnos: turnosPermitidos,
      error: error,
      valores: valores,
    });
    return;
  }

  // Camino valido: deja los datos listos y sigue al handler.
  req.reservaValidada = {
    estudiante: estudiante,
    email: email,
    sala: sala,
    fecha: fecha,
    turno: turno,
    personas: personas,
  };

  next();
}

// El handler final confia en el validador, no repite las comprobaciones.
function crearReserva(req, res) {
  const nueva = {
    id: proximoId(),
    estudiante: req.reservaValidada.estudiante,
    email: req.reservaValidada.email,
    sala: req.reservaValidada.sala,
    fecha: req.reservaValidada.fecha,
    turno: req.reservaValidada.turno,
    personas: req.reservaValidada.personas,
  };

  reservas.push(nueva);

  res.redirect("/reservas");
}

reservasRouter.post("/", validarReserva, crearReserva);

// Se monta el router. Las rutas de adentro son relativas a /reservas.
app.use("/reservas", reservasRouter);

// ---------------------------------------------------------------
// Pagina 404, al final de todo
// ---------------------------------------------------------------

app.use(function (req, res) {
  res.status(404).render("no-encontrado", {
    titulo: "Página no encontrada",
    mensaje: "La dirección solicitada no existe.",
  });
});

// ---------------------------------------------------------------
// Funciones auxiliares
// ---------------------------------------------------------------

// campos vacios, para la primera vez que se abre el formulario
function valoresVacios() {
  return {
    estudiante: "",
    email: "",
    sala: "",
    fecha: "",
    turno: "",
    personas: "",
  };
}

// el id mas alto que haya + 1
function proximoId() {
  let mayor = 0;

  reservas.forEach(function (reserva) {
    if (reserva.id > mayor) {
      mayor = reserva.id;
    }
  });

  return mayor + 1;
}

// ---------------------------------------------------------------
// Arranque
// ---------------------------------------------------------------

app.listen(PUERTO, function () {
  console.log("Servidor andando en http://localhost:" + PUERTO);
  console.log("Reservas iniciales: " + reservas.length);
});
