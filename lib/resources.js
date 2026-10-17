// Tipos: i=entero, n=decimal, s=texto, b=booleano, d=fecha, h=hora. "!" = obligatorio al insertar.
const ADMIN = ['Administrador'];
const TODOS = ['Administrador', 'Operador'];

module.exports = {
  productos: { t: 'productos', pk: 'id_producto', search: 'nombre', write: ADMIN, f: { id_categoria: 'i', nombre: 's!', precio_venta: 'n!', costo: 'n', stock_actual: 'i', stock_minimo: 'i', estado: 'b' } },
  clientes: { t: 'clientes', pk: 'id_cliente', search: 'nombre', write: TODOS, extra: ['fecha_registro'], f: { nombre: 's!', telefono: 's', correo: 's' } },
  canchas: { t: 'canchas', pk: 'id_cancha', search: 'nombre', write: ADMIN, f: { nombre: 's!', tarifa_hora: 'n', estado: 's' } },
  reservas: { t: 'reservas', pk: 'id_reserva', write: TODOS, f: { id_cancha: 'i!', id_cliente: 'i!', fecha: 'd!', hora_inicio: 'h!', hora_fin: 'h!', estado: 's', valor: 'n' } },
  mesas: { t: 'mesas', pk: 'id_mesa', write: ADMIN, extra: ['estado'], f: { numero: 'i!' } },
  proveedores: { t: 'proveedores', pk: 'id_proveedor', search: 'nombre', write: ADMIN, f: { nombre: 's!', telefono: 's', correo: 's', direccion: 's' } },
  categorias: { t: 'categorias', pk: 'id_categoria', search: 'nombre', write: ADMIN, f: { nombre: 's!' } },
  promociones: { t: 'promociones', pk: 'id_promocion', search: 'nombre', write: ADMIN, f: { nombre: 's!', tipo: 's', valor: 'n', fecha_inicio: 'd', fecha_fin: 'd', estado: 'b' } },
  usuarios: { t: 'usuarios', pk: 'id_usuario', search: 'nombre', read: ADMIN, write: ADMIN, f: { id_rol: 'i!', nombre: 's!', usuario: 's!', correo: 's', estado: 'b' } },
};
