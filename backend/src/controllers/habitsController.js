import { PrismaClient } from '@prisma/client'
import { habitUserSchema, updateSettingsSchema } from '../validations/habitsValidations.js'
import { validateHabitExistence, validateUserExistence } from '../validations/validationUtils.js'
const prisma = new PrismaClient()

// GETS
async function getAvailableHabits (req, res) {
  // Aquí se podrían enseñar todos los hábitos, ahora mismo esta hecho para que se muestren solo
  // los que el usuario tiene configurados
  try {
    const userHabits = await prisma.userHabit.findMany({
      where: {
        user_id: '044a8e06-3aa6-4536-9d05-09143c58d7ca' // TODO: recoger el id del usuario de la session
      },
      select: {
        habit_id: true
      }
    })
    console.log(userHabits)
    const userHabitIds = userHabits.map(habit => habit.habit_id)
    console.log(userHabitIds)
    const availableHabits = await prisma.habit.findMany({
      where: {
        id: {
          notIn: userHabitIds
        }
      }
    })

    res.json(availableHabits)
  } catch (error) {
    res.status(500).json({ error: 'Algo ocurrió al recuperar todos los hábitos' })
  }
}

async function getHabitsUser (req, res) {
  try {
    if (!await validateUserExistence(req.params.user_id)) { return res.status(400).json({ message: 'BD error. The user doesnt exists' }) }

    const userHabits = await prisma.userHabit.findMany({
      where: {
        user_id: req.params.user_id // TODO: recoger el id del usuario de la session
      },
      select: {
        habit_id: true,
        current_streak: true
      }
    })
    if (userHabits.length !== 0) {
      const streakMap = userHabits.reduce((map, habit) => {
        map[habit.habit_id] = habit.current_streak
        return map
      }, {})

      const userHabitIds = userHabits.map(habit => habit.habit_id)

      const availableHabits = await prisma.habit.findMany({
        where: {
          id: {
            in: userHabitIds
          }
        }
      })

      const habitsWithStreaks = availableHabits.map(habit => {
        return {
          ...habit,
          current_streak: streakMap[habit.id] || 0
        }
      })

      res.json(habitsWithStreaks)
    } else { res.status(404).json({ error: 'The user has not habits' }) }
  } catch (error) {
    res.status(500).json({ error: 'Algo ocurrió al recuperar todos los hábitos' })
  }
}

async function getHabitUserInfo (req, res) {
  try {
    const habitUser = await prisma.userHabit.findFirst({
      where: {
        habit_id: req.params.habit_id,
        user_id: req.params.user_id
      }
    })
    if (habitUser !== null) res.json(habitUser)
    else { res.status(404).json({ error: 'The habit is not being used by the user' }) }
  } catch (error) {
    res.status(500).json({
      error: 'Algo ocurrió recuperando el hábito del usuario'
    })
  }
}

async function getHabitTips (req, res) {
  try {
    if (!await validateHabitExistence(req.params.habit_id)) { return res.status(400).json({ message: 'BD error. The habit doesnt exists' }) }

    const habitTips = await prisma.tip.findFirst({
      where: {
        habit_id: req.params.habit_id
      }
    })
    res.json(habitTips.tips)
  } catch (error) {
    res.status(500).json({
      error: 'Algo ocurrió recuperando los tips del habito'
    })
  }
}

async function getHabitUnit (req, res) {
  try {
    if (!await validateHabitExistence(req.params.habit_id)) { return res.status(400).json({ message: 'BD error. The habit doesnt exists' }) }

    const unit = await prisma.unit.findFirst({
      where: {
        habit_id: req.params.habit_id
      },
      select: {
        unit: true
      }
    })

    if (unit === null) { res.status(404).json({ message: 'unit not found' }) }

    res.json(unit)
  } catch (error) {
    res.status(500).json({
      error: 'Algo ocurrió recuperando la unidad del habito'
    })
  }
}

// POSTS
async function createHabitUser (req, res) {
  try {
    const habitId = req.params.habit_id
    const userId = req.params.user_id
    const parsedData = habitUserSchema.parse(req.body)

    if (!await validateUserExistence(userId)) { return res.status(400).json({ message: 'BD error. The user doesnt exists' }) }

    if (!await validateHabitExistence(habitId)) { return res.status(400).json({ message: 'BD error. The habit doesnt exists' }) }

    const existingHabitUser = await prisma.userHabit.findFirst({
      where: {
        habit_id: habitId,
        user_id: userId
      }
    })
    console.log(existingHabitUser)
    if (existingHabitUser) { return res.status(400).json({ message: 'BD error. The habit is already using by the user' }) }

    if (existingHabitUser === null) {
      const newHabitUser = await prisma.userHabit.create({
        data: {
          // TODO: quitar el user_id de la url y cogerlo de session
          ...parsedData,
          habit_id: habitId,
          user_id: userId
        }
      })

      return res.status(201).json(newHabitUser)
    }
  } catch (error) {
    if (error.name === 'ZodError') {
      console.log('Zod Error. Validación de datos')
      return res.status(400).json({ errors: error.errors })
    }

    res.status(500).json({ error: error.message })
  }
}

async function updateHabitUserSettings (req, res) {
  // validamos con zod
  // se usa un esquema diferente, ya que con en el patch se puede actualizar cualquier campo
  const parsedData = updateSettingsSchema.parse(req.body)
  // comprobamos que el usuario y el habito existan
  if (!await validateUserExistence(req.params.user_id)) { return res.status(400).json({ message: 'BD error. The user doesnt exists' }) }

  if (!await validateHabitExistence(req.params.habit_id)) { return res.status(400).json({ message: 'BD error. The habit doesnt exists' }) }

  // comprobamos el registro a editar
  const habitUserToEdit = await prisma.userHabit.findFirst({
    where: {
      habit_id: req.params.habit_id,
      user_id: req.params.user_id
    }
  })

  if (habitUserToEdit !== null) {
    const updatedHabitUser = await prisma.userHabit.update({
      // el update de prisma solo espera un parametro en el where
      where: {
        id: habitUserToEdit.id
      },
      data: {
        settings: {
          ...habitUserToEdit.settings,
          ...parsedData
        }
      }
    })

    res.json(updatedHabitUser)
  } else { res.status(404).json({ error: 'The habit is not being used by the user' }) }
}

async function deleteHabitUser (req, res) {
  // validaciones de existencia de usuario y habtto
  if (!await validateUserExistence(req.params.user_id)) { return res.status(400).json({ error: 'BD error. The user doesnt exists' }) }

  if (!await validateHabitExistence(req.params.habit_id)) { return res.status(400).json({ error: 'BD error. The habit doesnt exists' }) }

  try {
    const habitUserToDelete = await prisma.userHabit.findFirst({
      where: {
        user_id: req.params.user_id,
        habit_id: req.params.habit_id
      }
    })
    console.log(habitUserToDelete)
    if (habitUserToDelete === null) { res.status(400).json({ error: 'The habit is not being used by the user.' }) } else {
      const habitUserDeleted = await prisma.userHabit.delete({
        where: {
          id: habitUserToDelete.id
        }
      })

      res.status(200).json(habitUserDeleted)
    }
  } catch (error) {
    if (error.name === 'ZodError') {
      console.log('Zod Error. Validación de datos')
      return res.status(400).json({ errors: error.errors })
    }

    res.status(500).json({ error: error.message })
  }
}

export default {
  getAvailableHabits,
  getHabitsUser,
  getHabitUserInfo,
  getHabitTips,
  getHabitUnit,
  createHabitUser,
  updateHabitUserSettings,
  deleteHabitUser
}
