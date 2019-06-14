import { LocationWeather, Locations } from '../LocationWeather'

describe('LocationWeather', () => {

  it('should recieve an api key', async () => {
    const key = LocationWeather.apiKey
    expect(LocationWeather).toHaveProperty('apiKey')
    expect((LocationWeather.apiKey).length).toBeGreaterThanOrEqual(1)
    LocationWeather.apiKey = ''
    await expect(LocationWeather.getWeatherData([])).rejects.toThrowError('please supply a valid api key')
    LocationWeather.apiKey = key
  })

  describe('::getWeatherByLocation', () => {
    it('should not accept invalid array of locations', async () => {
      const errorMessage = 'data set should be an array containing locations and postal codes'
      await expect(LocationWeather.getWeatherData('' as any)).rejects.toThrowError(errorMessage)
    })

    it('should not allow empty locations', async() => {
      await expect(LocationWeather.getWeatherData([])).rejects.toThrowError('data set should not be empty')
    })

    it('should allow maximum of ten locations', async () => {
      const errorMessage = 'data set should not contain more than 10 entries'
      await expect(LocationWeather.getWeatherData(Array(11))).rejects.toThrowError(errorMessage)
    })

    it('should validate each location', async () => {
      const errorMessage = 'each location should be a city(string) or zipcode(integer)'
      await expect(LocationWeather.getWeatherData([[] as any])).rejects.toThrowError(errorMessage)
    })

    it('should return the weather data for the locations', async () => {
      const locations: Locations = ['New York', 10005, 'Austin', 50001, 'Lagos', 100232]
      const data = await LocationWeather.getWeatherData(locations)
      const properties = ['timezone', 'ob_time', 'city_name', 'datetime', 'weather']
      const locationEntries = Object.entries(data)

      expect(locationEntries.length).toEqual(locations.length)
      locationEntries.forEach(entry => {
        properties.forEach(property => expect(entry[1]).toHaveProperty(property))
        expect(entry[1].weather).toHaveProperty('description')
      })
    })

    it('should not return the weather data for invalid locations', async () => {
      const errorRegex = /no\sweather\sdata\sfor\s\w+/
      await expect(LocationWeather.getWeatherData(['obanikorosssss', 'kjkkssjkjkj'])).rejects.toThrowError(errorRegex)
    })
  })

})
